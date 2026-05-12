-- ============================================================================
-- Migration 036: Customer Import RPC Functions
--
-- Enables Phase 2 (DB-side) processing for customer import sessions.
-- Matches the two-phase pattern established for scheme import in migration 004.
--
-- Changes:
--   1. ADD family_head_ext_ref_id to ki_clients
--      Stores the raw platform externalid of the family head during import.
--      Resolved to ki_families.id by resolve_customer_families() after import.
--
--   2. FUNCTION process_single_customer_record(p_staging_id INTEGER)
--      Processes one staged customer row into ki_contacts + ki_clients + ki_client_addresses.
--      Duplicate check: externalid match against ki_clients.ext_ref_id (tenant + is_live scoped).
--      Family linkage: writes family_head_ext_ref_id for later resolution.
--
--   3. FUNCTION process_customer_import_with_timing(p_session_id INTEGER, ...)
--      Batch orchestrator — same pattern as process_scheme_import_with_timing.
--      Loops all pending staging rows, calls process_single_customer_record per row.
--
--   4. FUNCTION resolve_customer_families(p_tenant_id UUID, p_is_live BOOLEAN)
--      Post-import pass: creates ki_families rows and links all family members.
--      Run after a customer import session completes.
--
-- Key design decisions (confirmed with user):
--   - externalid is THE primary identifier — duplicate detection is solely on this
--   - Minors intentionally share parent PAN/email/mobile → NOT used for dedup
--   - family_head_externalid links members to their head (same as kewalinvest pattern)
--   - Transactions (Tbook.xlsx) are out of scope for this migration
-- ============================================================================


-- ============================================================================
-- 1. ADD family_head_ext_ref_id TO ki_clients
-- ============================================================================

ALTER TABLE ki_clients
    ADD COLUMN IF NOT EXISTS family_head_ext_ref_id VARCHAR(100);

COMMENT ON COLUMN ki_clients.family_head_ext_ref_id IS
    'Raw platform externalid of this client''s family head from import. '
    'Resolved to ki_families.id by resolve_customer_families() after import.';

CREATE INDEX IF NOT EXISTS idx_ki_clients_family_head_ext_ref
    ON ki_clients(tenant_id, is_live, family_head_ext_ref_id)
    WHERE family_head_ext_ref_id IS NOT NULL;


-- ============================================================================
-- 2. FUNCTION process_single_customer_record
--
-- Processes one staged customer row (from ki_import_staging) into:
--   ki_contacts → ki_contact_channels (email + mobile) → ki_clients → ki_client_addresses
--
-- The staged row's tenant_id and is_live come from ki_import_sessions (via JOIN).
-- Uses ki_next_seq() for contact_no and client_no — must run within a transaction.
-- ============================================================================

DROP FUNCTION IF EXISTS process_single_customer_record(INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION process_single_customer_record(p_staging_id INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_staging           RECORD;
    v_mapped_data       JSONB;
    v_contact_id        BIGINT;
    v_client_id         INTEGER;
    v_is_duplicate      BOOLEAN;
    v_error_messages    TEXT[];
    v_clean_prefix      VARCHAR(10);
    v_date_of_birth     DATE;
    v_anniversary_date  DATE;
    v_externalid        VARCHAR(100);
    v_mobile            TEXT;
    v_address_line2     TEXT;
    v_name              TEXT;
BEGIN
    -- Fetch staging row with tenant context from its session
    SELECT
        s.*,
        sess.tenant_id,
        sess.is_live
    INTO v_staging
    FROM ki_import_staging s
    JOIN ki_import_sessions sess ON sess.id = s.session_id
    WHERE s.id = p_staging_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Mark as processing
    UPDATE ki_import_staging
    SET processing_status = 'processing'
    WHERE id = p_staging_id;

    v_mapped_data    := v_staging.mapped_data;
    v_error_messages := ARRAY[]::TEXT[];

    BEGIN
        -- ── Validate required field: name ──────────────────────────────────
        v_name := TRIM(COALESCE(v_mapped_data->>'name', ''));
        IF v_name = '' THEN
            RAISE EXCEPTION 'name is required';
        END IF;

        -- ── Duplicate check on externalid ──────────────────────────────────
        -- Only externalid is used for dedup. PAN/email/mobile are intentionally
        -- excluded because minors share parent PAN, email, and mobile.
        v_externalid := NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'externalid', ''))), '');

        IF v_externalid IS NOT NULL THEN
            SELECT EXISTS(
                SELECT 1 FROM ki_clients
                WHERE ext_ref_id  = v_externalid
                  AND tenant_id   = v_staging.tenant_id
                  AND is_live     = v_staging.is_live
                  AND is_active   = true
            ) INTO v_is_duplicate;

            IF v_is_duplicate THEN
                UPDATE ki_import_staging
                SET processing_status = 'duplicate',
                    warnings          = array_append(warnings, 'Client already exists with this externalid'),
                    processed_at      = CURRENT_TIMESTAMP
                WHERE id = p_staging_id;
                RETURN;
            END IF;
        END IF;

        -- ── Normalize mobile ───────────────────────────────────────────────
        -- Strip +91 or 91 country-code prefix; keep 10 digits
        v_mobile := TRIM(COALESCE(v_mapped_data->>'mobile', ''));
        IF v_mobile != '' THEN
            IF v_mobile LIKE '+91%' AND LENGTH(v_mobile) = 13 THEN
                v_mobile := SUBSTRING(v_mobile FROM 4);
            ELSIF v_mobile LIKE '91%' AND LENGTH(v_mobile) = 12 THEN
                v_mobile := SUBSTRING(v_mobile FROM 3);
            END IF;
            -- Keep empty string if still not 10 digits? No — store as-is and let app validate
        END IF;

        -- ── Clean prefix ───────────────────────────────────────────────────
        -- Strip dots, uppercase, then map to the allowed values in ki_contacts.prefix CHECK constraint:
        -- ('Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt')
        v_clean_prefix := UPPER(TRIM(REPLACE(COALESCE(v_mapped_data->>'prefix', ''), '.', '')));
        v_clean_prefix := CASE
            WHEN v_clean_prefix IN ('MR')           THEN 'Mr'
            WHEN v_clean_prefix IN ('MRS')          THEN 'Mrs'
            WHEN v_clean_prefix IN ('MS', 'MISS')   THEN 'Ms'
            WHEN v_clean_prefix IN ('DR')           THEN 'Dr'
            WHEN v_clean_prefix IN ('PROF')         THEN 'Prof'
            WHEN v_clean_prefix IN ('SMT', 'SHRIMATI', 'SRIMATHI') THEN 'Smt'
            ELSE 'Sri'   -- default for anything not recognised (inc. empty)
        END;

        -- ── Parse date_of_birth ────────────────────────────────────────────
        v_date_of_birth := NULL;
        IF v_mapped_data->>'date_of_birth' IS NOT NULL
            AND TRIM(v_mapped_data->>'date_of_birth') != ''
        THEN
            BEGIN
                v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'DD-MM-YYYY');
            EXCEPTION WHEN OTHERS THEN
                BEGIN
                    v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'YYYY-MM-DD');
                EXCEPTION WHEN OTHERS THEN
                    BEGIN
                        v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'MM-DD-YYYY');
                    EXCEPTION WHEN OTHERS THEN
                        v_date_of_birth := NULL;
                    END;
                END;
            END;
        END IF;

        -- ── Parse anniversary_date ─────────────────────────────────────────
        v_anniversary_date := NULL;
        IF v_mapped_data->>'anniversary_date' IS NOT NULL
            AND TRIM(v_mapped_data->>'anniversary_date') != ''
        THEN
            BEGIN
                v_anniversary_date := TO_DATE(v_mapped_data->>'anniversary_date', 'DD-MM-YYYY');
            EXCEPTION WHEN OTHERS THEN
                BEGIN
                    v_anniversary_date := TO_DATE(v_mapped_data->>'anniversary_date', 'YYYY-MM-DD');
                EXCEPTION WHEN OTHERS THEN
                    v_anniversary_date := NULL;
                END;
            END;
        END IF;

        -- ── Combine address_line2 + address_line3 ─────────────────────────
        v_address_line2 := NULLIF(TRIM(
            COALESCE(NULLIF(TRIM(v_mapped_data->>'address_line2'), ''), '') ||
            CASE
                WHEN NULLIF(TRIM(v_mapped_data->>'address_line3'), '') IS NOT NULL
                THEN ' ' || TRIM(v_mapped_data->>'address_line3')
                ELSE ''
            END
        ), '');

        -- ── INSERT ki_contacts ─────────────────────────────────────────────
        INSERT INTO ki_contacts (
            tenant_id,
            is_live,
            prefix,
            name,
            is_client,
            city,
            contact_no,
            created_at
        ) VALUES (
            v_staging.tenant_id,
            v_staging.is_live,
            v_clean_prefix,
            v_name,
            true,
            NULLIF(TRIM(v_mapped_data->>'city'), ''),
            ki_next_seq(v_staging.tenant_id, 'contact'),
            CURRENT_TIMESTAMP
        ) RETURNING id INTO v_contact_id;

        -- ── INSERT email channel ───────────────────────────────────────────
        IF v_mapped_data->>'email' IS NOT NULL
            AND TRIM(v_mapped_data->>'email') != ''
        THEN
            INSERT INTO ki_contact_channels (
                contact_id, tenant_id, is_live, channel_type, channel_value, is_primary
            ) VALUES (
                v_contact_id,
                v_staging.tenant_id,
                v_staging.is_live,
                'email',
                LOWER(TRIM(v_mapped_data->>'email')),
                true
            );
        END IF;

        -- ── INSERT mobile channel ──────────────────────────────────────────
        IF v_mobile != '' THEN
            INSERT INTO ki_contact_channels (
                contact_id, tenant_id, is_live, channel_type, channel_value, is_primary
            ) VALUES (
                v_contact_id,
                v_staging.tenant_id,
                v_staging.is_live,
                'mobile',
                v_mobile,
                -- primary only if no email was inserted
                CASE WHEN v_mapped_data->>'email' IS NULL
                          OR TRIM(v_mapped_data->>'email') = ''
                     THEN true ELSE false END
            );
        END IF;

        -- ── INSERT ki_clients ──────────────────────────────────────────────
        -- Fills both legacy columns (name, email, phone, dob, address, city, state)
        -- and ProKey columns (contact_id, is_live, pan, ext_ref_id, …)
        INSERT INTO ki_clients (
            tenant_id,
            is_live,
            is_active,
            contact_id,
            -- legacy flat columns (used by portfolio skill queries)
            name,
            email,
            phone,
            dob,
            address,
            city,
            state,
            -- ProKey columns
            pan,
            ext_ref_id,
            family_head_ext_ref_id,
            anniversary_date,
            referred_by_name,
            client_no,
            created_at
        ) VALUES (
            v_staging.tenant_id,
            v_staging.is_live,
            true,
            v_contact_id,
            -- legacy
            v_name,
            NULLIF(LOWER(TRIM(COALESCE(v_mapped_data->>'email', ''))), ''),
            NULLIF(v_mobile, ''),
            v_date_of_birth,
            NULLIF(TRIM(COALESCE(v_mapped_data->>'address_line1', '')), ''),
            NULLIF(TRIM(COALESCE(v_mapped_data->>'city', '')), ''),
            NULLIF(TRIM(COALESCE(v_mapped_data->>'state', '')), ''),
            -- ProKey
            NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'pan', ''))), ''),
            v_externalid,
            NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'family_head_externalid', ''))), ''),
            v_anniversary_date,
            NULLIF(TRIM(COALESCE(v_mapped_data->>'referred_by_name', '')), ''),
            ki_next_seq(v_staging.tenant_id, 'client'),
            CURRENT_TIMESTAMP
        ) RETURNING id INTO v_client_id;

        -- ── INSERT ki_client_addresses ─────────────────────────────────────
        -- Only if at least one address field is present
        IF NULLIF(TRIM(COALESCE(v_mapped_data->>'address_line1', '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(v_mapped_data->>'city', '')), '') IS NOT NULL
        THEN
            INSERT INTO ki_client_addresses (
                client_id,
                tenant_id,
                is_live,
                address_type,
                line1,
                line2,
                city,
                state,
                country,
                pincode,
                is_primary
            ) VALUES (
                v_client_id,
                v_staging.tenant_id,
                v_staging.is_live,
                'residential',
                COALESCE(NULLIF(TRIM(v_mapped_data->>'address_line1'), ''), 'Not Provided'),
                v_address_line2,
                COALESCE(NULLIF(TRIM(v_mapped_data->>'city'), ''),    'Unknown'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'state'), ''),   'Unknown'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'country'), ''), 'India'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'pincode'), ''), '000000'),
                true
            );
        END IF;

        -- ── Mark success ───────────────────────────────────────────────────
        UPDATE ki_import_staging
        SET processing_status    = 'success',
            created_record_id    = v_client_id::TEXT,
            created_record_type  = 'client',
            processed_at         = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;

    EXCEPTION WHEN OTHERS THEN
        -- Capture the error; inner EXCEPTION block rolls back partial writes via savepoint
        v_error_messages := array_append(v_error_messages, SQLERRM);

        UPDATE ki_import_staging
        SET processing_status = 'failed',
            error_messages    = v_error_messages,
            processed_at      = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;

        -- ki_contact_channels cascade-deletes on ki_contacts delete (ON DELETE CASCADE)
        -- ki_client_addresses cascade-deletes on ki_clients delete (ON DELETE CASCADE)
        -- So we only need to delete the parent records.
        -- Note: ki_clients.contact_id has ON DELETE RESTRICT — delete client first.
        IF v_client_id IS NOT NULL THEN
            DELETE FROM ki_clients WHERE id = v_client_id;
        END IF;
        IF v_contact_id IS NOT NULL THEN
            DELETE FROM ki_contacts WHERE id = v_contact_id;
        END IF;
    END;
END;
$$;

COMMENT ON FUNCTION process_single_customer_record IS
    'Process one staged customer row into ki_contacts + ki_contact_channels + ki_clients + ki_client_addresses. '
    'Duplicate check: externalid only (PAN/email/mobile excluded — minors share parent values). '
    'Adapted from kewalinvest process_single_customer_record; uses ki_ tables and ki_next_seq.';


-- ============================================================================
-- 3. FUNCTION process_customer_import_with_timing
--
-- Batch orchestrator for customer import sessions.
-- Identical structure to process_scheme_import_with_timing.
-- Called from Node.js: SELECT * FROM process_customer_import_with_timing($1, $2)
-- ============================================================================

DROP FUNCTION IF EXISTS process_customer_import_with_timing(INTEGER, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION process_customer_import_with_timing(
    p_session_id          INTEGER,
    p_target_duration_ms  INTEGER DEFAULT 60000
)
RETURNS TABLE(
    processed_count  INTEGER,
    success_count    INTEGER,
    failed_count     INTEGER,
    duplicate_count  INTEGER,
    actual_duration_ms INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time        TIMESTAMP;
    v_end_time          TIMESTAMP;
    v_staging_record    RECORD;
    v_processed_count   INTEGER := 0;
    v_success_count     INTEGER := 0;
    v_failed_count      INTEGER := 0;
    v_duplicate_count   INTEGER := 0;
    v_batch_size        INTEGER := 100;
    v_sleep_ms          INTEGER;
    v_status            TEXT;
BEGIN
    v_start_time := clock_timestamp();

    -- Update session status to processing
    UPDATE ki_import_sessions
    SET status                 = 'processing',
        processing_started_at  = v_start_time,
        updated_at             = CURRENT_TIMESTAMP
    WHERE id = p_session_id;

    -- Process all pending staging rows in row_number order
    FOR v_staging_record IN
        SELECT id
        FROM ki_import_staging
        WHERE session_id         = p_session_id
          AND processing_status  = 'pending'
        ORDER BY row_number
    LOOP
        PERFORM process_single_customer_record(v_staging_record.id);

        -- Read back status to update counters
        SELECT processing_status INTO v_status
        FROM ki_import_staging
        WHERE id = v_staging_record.id;

        v_processed_count := v_processed_count + 1;

        CASE v_status
            WHEN 'success'   THEN v_success_count   := v_success_count   + 1;
            WHEN 'failed'    THEN v_failed_count     := v_failed_count    + 1;
            WHEN 'duplicate' THEN v_duplicate_count  := v_duplicate_count + 1;
            ELSE NULL;
        END CASE;

        -- Checkpoint every 10 rows: update progress + small sleep to spread DB load
        IF v_processed_count % 10 = 0 THEN
            v_end_time := clock_timestamp();
            v_sleep_ms := (p_target_duration_ms / v_batch_size)
                          - EXTRACT(MILLISECOND FROM (v_end_time - v_start_time))::INTEGER;

            IF v_sleep_ms > 0 THEN
                PERFORM pg_sleep(v_sleep_ms / 1000.0);
            END IF;

            UPDATE ki_import_sessions
            SET processed_records  = v_processed_count,
                successful_records = v_success_count,
                failed_records     = v_failed_count,
                duplicate_records  = v_duplicate_count,
                last_processed_row = v_processed_count,
                updated_at         = CURRENT_TIMESTAMP
            WHERE id = p_session_id;
        END IF;
    END LOOP;

    v_end_time := clock_timestamp();

    -- Final session update
    UPDATE ki_import_sessions
    SET status = CASE
            WHEN v_failed_count > 0 THEN 'completed_with_errors'
            ELSE 'completed'
        END,
        processed_records       = v_processed_count,
        successful_records      = v_success_count,
        failed_records          = v_failed_count,
        duplicate_records       = v_duplicate_count,
        processing_completed_at = v_end_time,
        updated_at              = CURRENT_TIMESTAMP
    WHERE id = p_session_id;

    RETURN QUERY SELECT
        v_processed_count,
        v_success_count,
        v_failed_count,
        v_duplicate_count,
        EXTRACT(MILLISECOND FROM (v_end_time - v_start_time))::INTEGER;
END;
$$;

COMMENT ON FUNCTION process_customer_import_with_timing IS
    'Batch customer import orchestrator. Loops all pending staging rows for a session, '
    'calls process_single_customer_record per row, checkpoints progress every 10 rows. '
    'Returns: processed/success/failed/duplicate counts + actual duration in ms.';


-- ============================================================================
-- 4. FUNCTION resolve_customer_families
--
-- Post-import pass to link family members via ki_families.
-- Run AFTER process_customer_import_with_timing completes for a session.
--
-- Logic:
--   1. Find every distinct family_head_ext_ref_id in the session's new records.
--   2. Look up the head client (ext_ref_id matches family_head_ext_ref_id).
--   3. Create one ki_families row per family group (using head's name + head's id).
--   4. UPDATE all members (same family_head_ext_ref_id) with family_id.
--   5. Mark the head row as is_family_head = true.
--
-- Idempotent: skips families that already have a ki_families row
-- (i.e., clients whose family_id IS NOT NULL already).
-- ============================================================================

DROP FUNCTION IF EXISTS resolve_customer_families(UUID, BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION resolve_customer_families(
    p_tenant_id  UUID,
    p_is_live    BOOLEAN
)
RETURNS TABLE(
    families_created   INTEGER,
    members_linked     INTEGER,
    heads_not_found    INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_families_created  INTEGER := 0;
    v_members_linked    INTEGER := 0;
    v_heads_not_found   INTEGER := 0;
    v_head_rec          RECORD;
    v_family_id         UUID;
    v_linked_count      INTEGER;
BEGIN
    -- Process each distinct family_head_ext_ref_id that is not yet resolved
    FOR v_head_rec IN
        SELECT DISTINCT c.family_head_ext_ref_id
        FROM ki_clients c
        WHERE c.tenant_id             = p_tenant_id
          AND c.is_live               = p_is_live
          AND c.is_active             = true
          AND c.family_head_ext_ref_id IS NOT NULL
          AND c.family_id             IS NULL     -- not yet linked
        ORDER BY c.family_head_ext_ref_id
    LOOP
        -- Find the head client record
        SELECT id, name
        INTO v_head_rec
        FROM ki_clients
        WHERE ext_ref_id  = v_head_rec.family_head_ext_ref_id
          AND tenant_id   = p_tenant_id
          AND is_live     = p_is_live
          AND is_active   = true
        LIMIT 1;

        IF NOT FOUND THEN
            -- Head wasn't imported (e.g. file was partial) — skip this family
            v_heads_not_found := v_heads_not_found + 1;
            CONTINUE;
        END IF;

        -- Create family row
        INSERT INTO ki_families (
            tenant_id,
            is_live,
            family_name,
            head_client_id
        ) VALUES (
            p_tenant_id,
            p_is_live,
            v_head_rec.name,
            v_head_rec.id
        ) RETURNING id INTO v_family_id;

        v_families_created := v_families_created + 1;

        -- Link ALL members (including the head itself) to this family
        UPDATE ki_clients
        SET family_id      = v_family_id,
            is_family_head = (ext_ref_id = v_head_rec.ext_ref_id)
        WHERE tenant_id             = p_tenant_id
          AND is_live               = p_is_live
          AND is_active             = true
          AND family_head_ext_ref_id = v_head_rec.ext_ref_id
          AND family_id             IS NULL;

        GET DIAGNOSTICS v_linked_count = ROW_COUNT;
        v_members_linked := v_members_linked + v_linked_count;
    END LOOP;

    RETURN QUERY SELECT v_families_created, v_members_linked, v_heads_not_found;
END;
$$;

COMMENT ON FUNCTION resolve_customer_families IS
    'Post-import pass: groups ki_clients rows into ki_families using family_head_ext_ref_id. '
    'Run once after process_customer_import_with_timing completes. Idempotent — skips already-linked rows. '
    'Returns: families_created, members_linked, heads_not_found (head was not in import batch).';
