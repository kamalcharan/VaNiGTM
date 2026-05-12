-- ============================================================================
-- Migration 058: Idempotent re-application of ki_alerts → ki_pulses rename
--
-- 057 may have been recorded in vn_migrations but the DDL might not have
-- fully committed due to nested BEGIN/COMMIT interaction with the migration
-- runner. This migration is fully idempotent: every step checks the current
-- DB state and only acts if needed.
--
-- Safe to run whether 057 worked fully, partially, or not at all.
-- ============================================================================

-- ── 1. RENAME TABLE ki_alerts → ki_pulses (if not already done) ──────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ki_alerts'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ki_pulses'
    ) THEN
        ALTER TABLE ki_alerts RENAME TO ki_pulses;
        RAISE NOTICE '[058] ki_alerts renamed to ki_pulses';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ki_pulses'
    ) THEN
        RAISE NOTICE '[058] ki_pulses already exists — skipping rename';
    ELSE
        RAISE EXCEPTION '[058] Neither ki_alerts nor ki_pulses found — check schema';
    END IF;
END $$;

-- ── 2. RENAME alert_type → pulse_type (if not already done) ──────────────────

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ki_pulses' AND column_name = 'alert_type'
    ) THEN
        ALTER TABLE ki_pulses RENAME COLUMN alert_type TO pulse_type;
        RAISE NOTICE '[058] alert_type renamed to pulse_type';
    ELSE
        RAISE NOTICE '[058] pulse_type already exists — skipping column rename';
    END IF;
END $$;

-- ── 3. WIDEN pulse_type CHECK ─────────────────────────────────────────────────

DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM   pg_constraint
    WHERE  conrelid = 'ki_pulses'::regclass
      AND  contype  = 'c'
      AND  pg_get_constraintdef(oid) LIKE '%pulse_type%';
    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_pulses DROP CONSTRAINT ' || quote_ident(v_cname);
    END IF;
END $$;

ALTER TABLE ki_pulses
    ADD CONSTRAINT ki_pulses_pulse_type_check
    CHECK (pulse_type IN (
        'rebalance_needed', 'sip_at_risk', 'goal_behind',
        'tax_harvest_opportunity', 'review_due', 'large_redemption',
        'new_nfo_match', 'sip_bounced', 'nav_drop', 'new_scheme_detected',
        'prospect_followup', 'client_followup'
    ));

-- ── 4. ADD NEW COLUMNS (all idempotent via IF NOT EXISTS) ────────────────────

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS contact_id   BIGINT
        REFERENCES ki_contacts(id) ON DELETE SET NULL;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'system';

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'open';

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS due_date      DATE;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS snoozed_until DATE;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS snapshot_id  INTEGER
        REFERENCES ki_contact_snapshots(id) ON DELETE SET NULL;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS assigned_to  UUID;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

ALTER TABLE ki_pulses
    ADD COLUMN IF NOT EXISTS completed_by UUID;

-- ── 4b. ADD CHECK constraints on origin and status (idempotent) ──────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ki_pulses'::regclass
          AND contype  = 'c'
          AND pg_get_constraintdef(oid) LIKE '%origin%'
    ) THEN
        ALTER TABLE ki_pulses
            ADD CONSTRAINT ki_pulses_origin_check
            CHECK (origin IN ('system', 'manual'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ki_pulses'::regclass
          AND contype  = 'c'
          AND pg_get_constraintdef(oid) LIKE '%''open''%' AND pg_get_constraintdef(oid) LIKE '%''snoozed''%'
    ) THEN
        ALTER TABLE ki_pulses
            ADD CONSTRAINT ki_pulses_status_check
            CHECK (status IN ('open', 'snoozed', 'done', 'dismissed'));
    END IF;
END $$;

-- ── 5. MIGRATE EXISTING DATA ─────────────────────────────────────────────────

-- Set origin = 'system' for all rows that don't have it set yet
UPDATE ki_pulses
SET origin = 'system'
WHERE origin IS NULL OR origin NOT IN ('system', 'manual');

-- Migrate dismissed/acted_on → status (only for rows still at default 'open'
-- that have dismissed=true or acted_on=true — columns may or may not exist)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ki_pulses' AND column_name = 'dismissed'
    ) THEN
        UPDATE ki_pulses
        SET status = CASE
                       WHEN dismissed = true THEN 'dismissed'
                       WHEN acted_on  = true THEN 'done'
                       ELSE 'open'
                     END
        WHERE status = 'open';
        RAISE NOTICE '[058] Migrated dismissed/acted_on → status';
    ELSE
        RAISE NOTICE '[058] dismissed column already removed — skipping status migration';
    END IF;
END $$;

-- ── 6. DROP OLD COLUMNS (if they still exist) ────────────────────────────────

ALTER TABLE ki_pulses DROP COLUMN IF EXISTS dismissed;
ALTER TABLE ki_pulses DROP COLUMN IF EXISTS acted_on;

-- ── 7. REBUILD INDEXES ───────────────────────────────────────────────────────

DROP INDEX IF EXISTS idx_ki_alerts_tenant;
DROP INDEX IF EXISTS idx_ki_alerts_tenant_active;
DROP INDEX IF EXISTS idx_ki_alerts_client;
DROP INDEX IF EXISTS idx_ki_alerts_tenant_env;

CREATE INDEX IF NOT EXISTS idx_ki_pulses_tenant
    ON ki_pulses(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ki_pulses_tenant_open
    ON ki_pulses(tenant_id, is_live, status)
    WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_ki_pulses_client
    ON ki_pulses(tenant_id, client_id)
    WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_pulses_contact
    ON ki_pulses(tenant_id, contact_id)
    WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_pulses_tenant_env
    ON ki_pulses(tenant_id, is_live);

CREATE INDEX IF NOT EXISTS idx_ki_pulses_due_date
    ON ki_pulses(tenant_id, is_live, due_date)
    WHERE status = 'open' AND due_date IS NOT NULL;

-- ── 8. RLS POLICY ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS alert_tenant_isolation ON ki_pulses;
DROP POLICY IF EXISTS pulse_tenant_isolation  ON ki_pulses;

CREATE POLICY pulse_tenant_isolation ON ki_pulses
    USING (tenant_id::TEXT = current_setting('app.current_tenant_id', true));

-- ── 9. COMMENTS ──────────────────────────────────────────────────────────────

COMMENT ON TABLE ki_pulses IS
    'Unified follow-up surface. origin=system: auto-generated by import/alerts pipeline. '
    'origin=manual: MFD-created prospect or client follow-up.';

COMMENT ON COLUMN ki_pulses.pulse_type  IS 'System types + manual types: prospect_followup | client_followup.';
COMMENT ON COLUMN ki_pulses.origin      IS 'system = auto-generated pipeline alert; manual = MFD created.';
COMMENT ON COLUMN ki_pulses.status      IS 'open | snoozed | done | dismissed.';
COMMENT ON COLUMN ki_pulses.contact_id  IS 'Set for prospect_followup pulses (ki_contacts.id).';
COMMENT ON COLUMN ki_pulses.snapshot_id IS 'Optional link to ki_contact_snapshots.';
COMMENT ON COLUMN ki_pulses.assigned_to IS 'UUID of the vn_users row responsible for actioning this pulse.';

-- ── 10. RECREATE ki_process_txn_import_session referencing ki_pulses ─────────
-- Drop ALL overloaded versions first so CREATE OR REPLACE is unambiguous.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure::text AS sig
        FROM   pg_proc
        WHERE  proname = 'ki_process_txn_import_session'
          AND  pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
    END LOOP;
END $$;

CREATE OR REPLACE FUNCTION ki_process_txn_import_session(
    p_session_id             INTEGER,
    p_customer_lookup_method TEXT DEFAULT 'iwell_code'
)
RETURNS TABLE(
    total_processed   INTEGER,
    successful        INTEGER,
    failed            INTEGER,
    duplicates        INTEGER,
    orphans           INTEGER,
    processing_time_s NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_start_time         TIMESTAMPTZ := NOW();
    v_batch_size         INTEGER     := 500;
    v_tenant_id          UUID;
    v_is_live            BOOLEAN;
    v_creator_id         UUID;
    v_staging            RECORD;
    v_client_id          INTEGER;
    v_txn_type_id        INTEGER;
    v_scheme_code        TEXT;
    v_scheme_name        TEXT;
    v_portfolio_id       INTEGER;
    v_txn_id             BIGINT;
    v_error_msg          TEXT;
    v_is_new_holding     BOOLEAN;
    v_txn_amount         NUMERIC;
    v_processed          INTEGER := 0;
    v_success            INTEGER := 0;
    v_failed             INTEGER := 0;
    v_duplicates         INTEGER := 0;
    v_orphans            INTEGER := 0;
    v_batch_counter      INTEGER := 0;
BEGIN

    SELECT s.tenant_id, s.is_live, s.created_by
    INTO   v_tenant_id, v_is_live, v_creator_id
    FROM   ki_import_sessions s
    WHERE  s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[ki_process_txn_import_session] Session % not found', p_session_id;
    END IF;

    RAISE NOTICE '[Session %] Starting — lookup method: %', p_session_id, p_customer_lookup_method;

    UPDATE ki_import_sessions
    SET    status                = 'processing',
           processing_started_at = NOW(),
           updated_at            = NOW()
    WHERE  id = p_session_id;

    FOR v_staging IN (
        SELECT id, row_number, mapped_data
        FROM   ki_import_staging
        WHERE  session_id        = p_session_id
          AND  processing_status = 'pending'
        ORDER  BY id
    ) LOOP
        BEGIN
            v_client_id      := NULL;
            v_txn_type_id    := NULL;
            v_scheme_code    := NULL;
            v_scheme_name    := NULL;
            v_portfolio_id   := NULL;
            v_txn_id         := NULL;
            v_error_msg      := NULL;
            v_is_new_holding := FALSE;
            v_txn_amount     := 0;

            -- ── STEP 1: CLIENT LOOKUP ─────────────────────────────────────────
            IF p_customer_lookup_method = 'iwell_code' THEN
                IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c
                    WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                    LIMIT  1;
                    IF v_client_id IS NULL AND v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id FROM ki_clients c
                        WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;
                        IF v_client_id IS NOT NULL THEN
                            RAISE NOTICE '[Session %] Row %: client found via PAN fallback', p_session_id, v_staging.row_number;
                        END IF;
                    END IF;
                    IF v_client_id IS NULL THEN
                        v_error_msg := 'No client found with IWELL code: ' ||
                            COALESCE(v_staging.mapped_data->>'vendor_code', 'NULL');
                        IF v_staging.mapped_data->>'pan' IS NOT NULL THEN
                            v_error_msg := v_error_msg || ' or PAN: ' || (v_staging.mapped_data->>'pan');
                        END IF;
                    END IF;
                ELSE
                    IF v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id FROM ki_clients c
                        WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;
                        IF v_client_id IS NOT NULL THEN
                            RAISE NOTICE '[Session %] Row %: client found via PAN (no vendor_code)', p_session_id, v_staging.row_number;
                        ELSE
                            v_error_msg := 'No vendor_code in row; PAN fallback also failed: ' ||
                                (v_staging.mapped_data->>'pan');
                        END IF;
                    ELSE
                        v_error_msg := 'IWELL code (vendor_code) is required but not found in this row';
                    END IF;
                END IF;
            ELSIF p_customer_lookup_method = 'customer_name' THEN
                IF v_staging.mapped_data->>'customer_name' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c JOIN ki_contacts ct ON ct.id = c.contact_id
                    WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                      AND  c.is_active = true AND ct.is_active = true
                      AND  ct.normalized_name = ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                    LIMIT  1;
                    IF v_client_id IS NULL AND v_staging.mapped_data->>'pan' IS NOT NULL
                       AND TRIM(v_staging.mapped_data->>'pan') <> ''
                    THEN
                        SELECT c.id INTO v_client_id FROM ki_clients c
                        WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                          AND  c.is_active = true
                          AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                        LIMIT  1;
                    END IF;
                    IF v_client_id IS NULL THEN
                        v_error_msg := 'No client found with name: ' ||
                            COALESCE(v_staging.mapped_data->>'customer_name', 'NULL');
                    END IF;
                ELSE
                    v_error_msg := 'customer_name is required but not found in this row';
                END IF;
            ELSIF p_customer_lookup_method = 'both' THEN
                IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
                THEN
                    SELECT c.id INTO v_client_id FROM ki_clients c
                    WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                    LIMIT  1;
                END IF;
                IF v_client_id IS NULL AND v_staging.mapped_data->>'customer_name' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
                THEN
                    SELECT c.id INTO v_client_id
                    FROM   ki_clients c JOIN ki_contacts ct ON ct.id = c.contact_id
                    WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                      AND  c.is_active = true AND ct.is_active = true
                      AND  ct.normalized_name = ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                    LIMIT  1;
                END IF;
                IF v_client_id IS NULL AND v_staging.mapped_data->>'pan' IS NOT NULL
                   AND TRIM(v_staging.mapped_data->>'pan') <> ''
                THEN
                    SELECT c.id INTO v_client_id FROM ki_clients c
                    WHERE  c.tenant_id = v_tenant_id AND c.is_live = v_is_live
                      AND  c.is_active = true
                      AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                    LIMIT  1;
                END IF;
                IF v_client_id IS NULL THEN
                    v_error_msg := 'No client matched by vendor_code, name, or PAN';
                END IF;
            END IF;

            IF v_client_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'orphan',
                       error_messages    = ARRAY[COALESCE(v_error_msg, 'Client not found')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_orphans := v_orphans + 1; v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 2: TRANSACTION TYPE LOOKUP ──────────────────────────────
            SELECT kt.id INTO v_txn_type_id FROM ki_transaction_types kt
            WHERE  UPPER(TRIM(kt.txn_code)) = UPPER(TRIM(COALESCE(v_staging.mapped_data->>'txn_type', '')))
              AND  kt.is_active = true LIMIT 1;
            IF v_txn_type_id IS NULL THEN
                SELECT kt.id INTO v_txn_type_id FROM ki_transaction_types kt
                WHERE  UPPER(TRIM(kt.txn_name)) = UPPER(TRIM(COALESCE(v_staging.mapped_data->>'txn_type', '')))
                  AND  kt.is_active = true LIMIT 1;
            END IF;
            IF v_txn_type_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY['Unknown transaction type: ' || COALESCE(v_staging.mapped_data->>'txn_type', 'NULL')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed := v_failed + 1; v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 3: SCHEME LOOKUP ─────────────────────────────────────────
            v_scheme_code := NULL;
            v_scheme_name := COALESCE(v_staging.mapped_data->>'scheme_name', '');
            IF v_staging.mapped_data->>'isin' IS NOT NULL AND TRIM(v_staging.mapped_data->>'isin') <> '' THEN
                SELECT s.scheme_code INTO v_scheme_code FROM ki_schemes s
                WHERE  s.isin_growth = TRIM(v_staging.mapped_data->>'isin')
                    OR s.isin_dividend = TRIM(v_staging.mapped_data->>'isin') LIMIT 1;
            END IF;
            IF v_scheme_code IS NULL AND v_scheme_name <> '' THEN
                SELECT sa.scheme_code INTO v_scheme_code FROM ki_scheme_aliases sa
                WHERE  sa.alias_name_normalized = LOWER(TRIM(REGEXP_REPLACE(v_scheme_name, '\s+', ' ', 'g'))) LIMIT 1;
            END IF;
            IF v_scheme_code IS NULL AND v_scheme_name <> '' THEN
                SELECT sb.scheme_code INTO v_scheme_code FROM ki_scheme_bookmarks sb
                WHERE  sb.tenant_id = v_tenant_id
                  AND  LOWER(TRIM(REGEXP_REPLACE(sb.alias_name, '\s+', ' ', 'g'))) =
                       LOWER(TRIM(REGEXP_REPLACE(v_scheme_name, '\s+', ' ', 'g'))) LIMIT 1;
            END IF;
            IF v_scheme_code IS NOT NULL THEN
                IF NOT EXISTS (SELECT 1 FROM ki_scheme_bookmarks sb
                               WHERE sb.tenant_id = v_tenant_id AND sb.scheme_code = v_scheme_code) THEN
                    v_scheme_code := NULL;
                END IF;
            END IF;
            IF v_scheme_code IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY['Scheme not found or not bookmarked: ' || COALESCE(v_staging.mapped_data->>'scheme_name', 'NULL')],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed := v_failed + 1; v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 4: DUPLICATE CHECK ───────────────────────────────────────
            v_txn_amount := COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'amount'), '')::NUMERIC, 0);
            IF EXISTS (
                SELECT 1 FROM ki_transactions t
                WHERE  t.tenant_id = v_tenant_id AND t.is_live = v_is_live
                  AND  t.client_id = v_client_id AND t.scheme_code = v_scheme_code
                  AND  t.txn_date  = (v_staging.mapped_data->>'txn_date')::DATE
                  AND  t.amount    = v_txn_amount
                  AND  t.units     = COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'units'), '')::NUMERIC, 0)
            ) THEN
                UPDATE ki_import_staging SET processing_status = 'duplicate', processed_at = NOW() WHERE id = v_staging.id;
                v_duplicates := v_duplicates + 1; v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- ── STEP 5: PORTFOLIO ─────────────────────────────────────────────
            SELECT p.id INTO v_portfolio_id FROM ki_portfolios p
            WHERE  p.tenant_id = v_tenant_id AND p.is_live = v_is_live
              AND  p.client_id = v_client_id AND p.is_active = true LIMIT 1;
            IF v_portfolio_id IS NULL THEN
                INSERT INTO ki_portfolios (tenant_id, is_live, client_id, name, portfolio_type)
                VALUES (v_tenant_id, v_is_live, v_client_id, 'Default', 'regular')
                RETURNING id INTO v_portfolio_id;
            END IF;

            -- ── STEP 6: HOLDINGS UPSERT ──────────────────────────────────────
            v_is_new_holding := NOT EXISTS (
                SELECT 1 FROM ki_holdings
                WHERE  tenant_id = v_tenant_id AND is_live = v_is_live
                  AND  client_id = v_client_id AND scheme_code = v_scheme_code
            );
            INSERT INTO ki_holdings (tenant_id, is_live, client_id, portfolio_id, scheme_code,
                units, total_invested, is_sip, sip_start_date, updated_at)
            VALUES (v_tenant_id, v_is_live, v_client_id, v_portfolio_id, v_scheme_code,
                0, 0, false, (v_staging.mapped_data->>'txn_date')::DATE, NOW())
            ON CONFLICT (tenant_id, is_live, client_id, portfolio_id, scheme_code)
            DO UPDATE SET updated_at = NOW();

            -- ── STEP 7: TRANSACTION INSERT ────────────────────────────────────
            INSERT INTO ki_transactions (
                tenant_id, is_live, client_id, portfolio_id, scheme_code,
                txn_type_id, txn_date, amount, units, nav,
                stamp_duty, stt, tds, euin, arn, folio_no,
                fund_name, category, sip_reg_date, description,
                source, source_ref, import_session_id,
                is_potential_duplicate, portfolio_flag, created_at
            ) VALUES (
                v_tenant_id, v_is_live, v_client_id, v_portfolio_id, v_scheme_code,
                v_txn_type_id, (v_staging.mapped_data->>'txn_date')::DATE,
                v_txn_amount,
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'units'),       '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'nav'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stamp_duty'),   '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stt'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'tds'),          '')::NUMERIC, 0),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'euin',         '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'arn_code',     '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'folio_number', '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'fund_name',    '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'category',     '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'sip_reg_date', '')), '')::DATE,
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'description',  '')), ''),
                'import', v_staging.id::TEXT, p_session_id,
                false, true, NOW()
            )
            RETURNING id INTO v_txn_id;

            -- ── STEP 8: NEW SCHEME PULSE ──────────────────────────────────────
            IF v_is_new_holding THEN
                INSERT INTO ki_pulses (
                    tenant_id, is_live, client_id,
                    pulse_type, priority, title, body,
                    action_skill, action_function, action_params,
                    origin, status, created_at
                ) VALUES (
                    v_tenant_id, v_is_live, v_client_id,
                    'new_scheme_detected', 'medium',
                    'New MF detected: ' || v_staging.mapped_data->>'scheme_name',
                    'Scheme "' || v_staging.mapped_data->>'scheme_name' || '" appeared for the first time '
                    'in imported transactions. Review the investment plan for this client.',
                    'transaction-skill', 'get_transactions',
                    jsonb_build_object('client_id', v_client_id, 'scheme_code', v_scheme_code, 'txn_id', v_txn_id),
                    'system', 'open', NOW()
                )
                ON CONFLICT DO NOTHING;
            END IF;

            UPDATE ki_import_staging
            SET    processing_status = 'success', created_record_id = v_txn_id::TEXT, processed_at = NOW()
            WHERE  id = v_staging.id;
            v_success := v_success + 1; v_processed := v_processed + 1; v_batch_counter := v_batch_counter + 1;

            IF v_batch_counter >= v_batch_size THEN
                UPDATE ki_import_sessions
                SET    processed_records  = v_processed, successful_records = v_success,
                       failed_records     = v_failed,    duplicate_records  = v_duplicates,
                       orphan_records     = v_orphans,   updated_at         = NOW()
                WHERE  id = p_session_id;
                v_batch_counter := 0;
            END IF;

        EXCEPTION WHEN OTHERS THEN
            UPDATE ki_import_staging
            SET    processing_status = 'failed', error_messages = ARRAY[SQLERRM], processed_at = NOW()
            WHERE  id = v_staging.id;
            v_failed := v_failed + 1; v_processed := v_processed + 1;
        END;
    END LOOP;

    IF v_success > 0 THEN
        PERFORM ki_rebuild_holdings_from_txn(v_tenant_id, v_is_live, NULL);
        RAISE NOTICE '[Session %] Holdings rebuilt after % successful rows', p_session_id, v_success;
    END IF;

    UPDATE ki_import_sessions
    SET    status                  = CASE WHEN v_failed > 0 OR v_orphans > 0 THEN 'completed_with_errors' ELSE 'completed' END,
           processed_records       = v_processed, successful_records = v_success,
           failed_records          = v_failed,    duplicate_records  = v_duplicates,
           orphan_records          = v_orphans,   processing_completed_at = NOW(), updated_at = NOW()
    WHERE  id = p_session_id;

    RAISE NOTICE '[Session %] Done — processed=%, success=%, failed=%, dup=%, orphan=%',
        p_session_id, v_processed, v_success, v_failed, v_duplicates, v_orphans;

    RETURN QUERY SELECT v_processed, v_success, v_failed, v_duplicates, v_orphans,
        EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;
END;
$$;

COMMENT ON FUNCTION ki_process_txn_import_session IS
    'Process pending rows in ki_import_staging. Updated in migration 058 to reference ki_pulses.';
