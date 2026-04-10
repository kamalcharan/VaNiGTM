-- ============================================================================
-- Migration 037: Fix onboarding_status for imported clients
--
-- Problem:
--   ki_clients.onboarding_status defaults to 'pending' (migration 020).
--   Clients imported via the customer import pipeline are already "complete"
--   from the MFD's perspective — no ProKey onboarding workflow has been built
--   yet, and showing "pending onboarding" on every imported client is confusing.
--
-- Changes:
--   1. Backfill: Set onboarding_status = 'completed' on all existing ki_clients
--      that have an ext_ref_id (imported via platform) AND are currently 'pending'.
--
--   2. Replace process_single_customer_record (migration 036) with an updated
--      version that inserts with onboarding_status = 'completed'.
--      All other logic is identical; only the INSERT target changes.
-- ============================================================================


-- ============================================================================
-- 1. BACKFILL existing imported clients
-- ============================================================================

UPDATE ki_clients
SET    onboarding_status = 'completed',
       updated_at        = now()
WHERE  onboarding_status = 'pending'
  AND  ext_ref_id IS NOT NULL;   -- all platform-imported rows have an externalid


-- ============================================================================
-- 2. REPLACE process_single_customer_record
--    Added:  onboarding_status = 'completed' in the ki_clients INSERT
--    All other logic unchanged from migration 036.
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
    SELECT s.*, sess.tenant_id, sess.is_live
    INTO v_staging
    FROM ki_import_staging s
    JOIN ki_import_sessions sess ON sess.id = s.session_id
    WHERE s.id = p_staging_id;

    IF NOT FOUND THEN RETURN; END IF;

    UPDATE ki_import_staging SET processing_status = 'processing' WHERE id = p_staging_id;

    v_mapped_data    := v_staging.mapped_data;
    v_error_messages := ARRAY[]::TEXT[];

    BEGIN
        -- Validate name
        v_name := TRIM(COALESCE(v_mapped_data->>'name', ''));
        IF v_name = '' THEN RAISE EXCEPTION 'name is required'; END IF;

        -- Duplicate check on externalid only
        v_externalid := NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'externalid', ''))), '');

        IF v_externalid IS NOT NULL THEN
            SELECT EXISTS(
                SELECT 1 FROM ki_clients
                WHERE ext_ref_id = v_externalid
                  AND tenant_id  = v_staging.tenant_id
                  AND is_live    = v_staging.is_live
                  AND is_active  = true
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

        -- Normalise mobile
        v_mobile := TRIM(COALESCE(v_mapped_data->>'mobile', ''));
        IF v_mobile != '' THEN
            IF  v_mobile LIKE '+91%' AND LENGTH(v_mobile) = 13 THEN v_mobile := SUBSTRING(v_mobile FROM 4);
            ELSIF v_mobile LIKE '91%' AND LENGTH(v_mobile) = 12  THEN v_mobile := SUBSTRING(v_mobile FROM 3);
            END IF;
        END IF;

        -- Clean prefix
        v_clean_prefix := UPPER(TRIM(REPLACE(COALESCE(v_mapped_data->>'prefix', ''), '.', '')));
        v_clean_prefix := CASE
            WHEN v_clean_prefix IN ('MR')                           THEN 'Mr'
            WHEN v_clean_prefix IN ('MRS')                          THEN 'Mrs'
            WHEN v_clean_prefix IN ('MS', 'MISS')                   THEN 'Ms'
            WHEN v_clean_prefix IN ('DR')                           THEN 'Dr'
            WHEN v_clean_prefix IN ('PROF')                         THEN 'Prof'
            WHEN v_clean_prefix IN ('SMT', 'SHRIMATI', 'SRIMATHI') THEN 'Smt'
            ELSE 'Sri'
        END;

        -- Parse date_of_birth
        v_date_of_birth := NULL;
        IF v_mapped_data->>'date_of_birth' IS NOT NULL AND TRIM(v_mapped_data->>'date_of_birth') != '' THEN
            BEGIN v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'DD-MM-YYYY');
            EXCEPTION WHEN OTHERS THEN
                BEGIN v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'YYYY-MM-DD');
                EXCEPTION WHEN OTHERS THEN
                    BEGIN v_date_of_birth := TO_DATE(v_mapped_data->>'date_of_birth', 'MM-DD-YYYY');
                    EXCEPTION WHEN OTHERS THEN v_date_of_birth := NULL; END;
                END;
            END;
        END IF;

        -- Parse anniversary_date
        v_anniversary_date := NULL;
        IF v_mapped_data->>'anniversary_date' IS NOT NULL AND TRIM(v_mapped_data->>'anniversary_date') != '' THEN
            BEGIN v_anniversary_date := TO_DATE(v_mapped_data->>'anniversary_date', 'DD-MM-YYYY');
            EXCEPTION WHEN OTHERS THEN
                BEGIN v_anniversary_date := TO_DATE(v_mapped_data->>'anniversary_date', 'YYYY-MM-DD');
                EXCEPTION WHEN OTHERS THEN v_anniversary_date := NULL; END;
            END;
        END IF;

        -- Combine address_line2 + address_line3
        v_address_line2 := NULLIF(TRIM(
            COALESCE(NULLIF(TRIM(v_mapped_data->>'address_line2'), ''), '') ||
            CASE WHEN NULLIF(TRIM(v_mapped_data->>'address_line3'), '') IS NOT NULL
                 THEN ' ' || TRIM(v_mapped_data->>'address_line3') ELSE '' END
        ), '');

        -- INSERT ki_contacts
        INSERT INTO ki_contacts (tenant_id, is_live, prefix, name, is_client, city, contact_no, created_at)
        VALUES (
            v_staging.tenant_id, v_staging.is_live,
            v_clean_prefix, v_name, true,
            NULLIF(TRIM(v_mapped_data->>'city'), ''),
            ki_next_seq(v_staging.tenant_id, 'contact'),
            CURRENT_TIMESTAMP
        ) RETURNING id INTO v_contact_id;

        -- INSERT email channel
        IF v_mapped_data->>'email' IS NOT NULL AND TRIM(v_mapped_data->>'email') != '' THEN
            INSERT INTO ki_contact_channels (contact_id, tenant_id, is_live, channel_type, channel_value, is_primary)
            VALUES (v_contact_id, v_staging.tenant_id, v_staging.is_live,
                    'email', LOWER(TRIM(v_mapped_data->>'email')), true);
        END IF;

        -- INSERT mobile channel
        IF v_mobile != '' THEN
            INSERT INTO ki_contact_channels (contact_id, tenant_id, is_live, channel_type, channel_value, is_primary)
            VALUES (v_contact_id, v_staging.tenant_id, v_staging.is_live,
                    'mobile', v_mobile,
                    CASE WHEN v_mapped_data->>'email' IS NULL OR TRIM(v_mapped_data->>'email') = ''
                         THEN true ELSE false END);
        END IF;

        -- INSERT ki_clients  ← onboarding_status = 'completed' for imported clients
        INSERT INTO ki_clients (
            tenant_id, is_live, is_active,
            contact_id,
            name, email, phone, dob, address, city, state,
            pan, ext_ref_id, family_head_ext_ref_id,
            anniversary_date, referred_by_name,
            onboarding_status,
            client_no, created_at
        ) VALUES (
            v_staging.tenant_id, v_staging.is_live, true,
            v_contact_id,
            v_name,
            NULLIF(LOWER(TRIM(COALESCE(v_mapped_data->>'email', ''))), ''),
            NULLIF(v_mobile, ''),
            v_date_of_birth,
            NULLIF(TRIM(COALESCE(v_mapped_data->>'address_line1', '')), ''),
            NULLIF(TRIM(COALESCE(v_mapped_data->>'city', '')), ''),
            NULLIF(TRIM(COALESCE(v_mapped_data->>'state', '')), ''),
            NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'pan', ''))), ''),
            v_externalid,
            NULLIF(UPPER(TRIM(COALESCE(v_mapped_data->>'family_head_externalid', ''))), ''),
            v_anniversary_date,
            NULLIF(TRIM(COALESCE(v_mapped_data->>'referred_by_name', '')), ''),
            'completed',    -- imported clients need no further onboarding
            ki_next_seq(v_staging.tenant_id, 'client'),
            CURRENT_TIMESTAMP
        ) RETURNING id INTO v_client_id;

        -- INSERT ki_client_addresses if address data present
        IF NULLIF(TRIM(COALESCE(v_mapped_data->>'address_line1', '')), '') IS NOT NULL
            OR NULLIF(TRIM(COALESCE(v_mapped_data->>'city', '')), '') IS NOT NULL
        THEN
            INSERT INTO ki_client_addresses (
                client_id, tenant_id, is_live,
                address_type, line1, line2, city, state, country, pincode, is_primary
            ) VALUES (
                v_client_id, v_staging.tenant_id, v_staging.is_live,
                'residential',
                COALESCE(NULLIF(TRIM(v_mapped_data->>'address_line1'), ''), 'Not Provided'),
                v_address_line2,
                COALESCE(NULLIF(TRIM(v_mapped_data->>'city'),    ''), 'Unknown'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'state'),   ''), 'Unknown'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'country'), ''), 'India'),
                COALESCE(NULLIF(TRIM(v_mapped_data->>'pincode'), ''), '000000'),
                true
            );
        END IF;

        UPDATE ki_import_staging
        SET processing_status   = 'success',
            created_record_id   = v_client_id::TEXT,
            created_record_type = 'client',
            processed_at        = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;

    EXCEPTION WHEN OTHERS THEN
        v_error_messages := array_append(v_error_messages, SQLERRM);
        UPDATE ki_import_staging
        SET processing_status = 'failed',
            error_messages    = v_error_messages,
            processed_at      = CURRENT_TIMESTAMP
        WHERE id = p_staging_id;
        IF v_client_id  IS NOT NULL THEN DELETE FROM ki_clients  WHERE id = v_client_id;  END IF;
        IF v_contact_id IS NOT NULL THEN DELETE FROM ki_contacts WHERE id = v_contact_id; END IF;
    END;
END;
$$;

COMMENT ON FUNCTION process_single_customer_record IS
    'Process one staged customer row. Updated in migration 037: '
    'imported clients get onboarding_status = ''completed'' (not ''pending'').';
