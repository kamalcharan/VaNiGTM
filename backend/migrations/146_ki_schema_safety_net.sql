-- ============================================================
-- 046_ki_schema_safety_net.sql
--
-- IDEMPOTENT re-application of migrations 042–045.
--
-- Background: If vn_migrations was empty when the migration runner
-- first ran AND ki_schemes already existed, the bootstrap logic
-- seeded 042–045 as "applied" WITHOUT executing the SQL.
-- This migration re-applies all critical DDL from 042–045 using
-- IF NOT EXISTS / CREATE OR REPLACE so it is safe to run whether
-- or not the prior migrations actually executed.
--
-- Covers:
--   042: ki_transactions new columns + ki_corrections + ki_correction_steps
--   043: ki_normalize_contact_name(), CHECK constraint repairs,
--        txn_type nullable, holdings UNIQUE, staging orphan status
--   044: ki_import_sessions.orphan_records
--   045: ki_process_txn_import_session() (with fixed JSONB keys)
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: Add new columns to ki_transactions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ki_transactions
    ADD COLUMN IF NOT EXISTS description            TEXT,
    ADD COLUMN IF NOT EXISTS folio_no               TEXT,
    ADD COLUMN IF NOT EXISTS fund_name              TEXT,
    ADD COLUMN IF NOT EXISTS category               TEXT,
    ADD COLUMN IF NOT EXISTS tds                    NUMERIC(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS euin                   TEXT,
    ADD COLUMN IF NOT EXISTS arn                    TEXT,
    ADD COLUMN IF NOT EXISTS sip_reg_date           DATE,
    ADD COLUMN IF NOT EXISTS is_potential_duplicate BOOLEAN       NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS portfolio_flag         BOOLEAN       NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS txn_type_id            INTEGER       REFERENCES ki_transaction_types(id);


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: Seed missing transaction types
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ki_transaction_types (txn_code, txn_name, txn_type, is_active, description)
VALUES
    ('DIVIDEND PAYOUT',   'Dividend Payout',       'Deduction', true,
     'Cash dividend paid out to investor bank account'),
    ('DIVIDEND REINVEST', 'Dividend Reinvestment',  'Addition',  true,
     'Dividend reinvested as additional units in the same scheme')
ON CONFLICT (txn_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: Backfill txn_type_id for existing legacy rows
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE ki_transactions t
SET txn_type_id = ktt.id
FROM ki_transaction_types ktt
WHERE t.txn_type_id IS NULL
  AND (
      (t.txn_type = 'purchase'          AND ktt.txn_code = 'PURCHASE')       OR
      (t.txn_type = 'redemption'        AND ktt.txn_code = 'REDEMPTION')     OR
      (t.txn_type = 'switch_in'         AND ktt.txn_code = 'SWITCH IN')      OR
      (t.txn_type = 'switch_out'        AND ktt.txn_code = 'SWITCH OUT')     OR
      (t.txn_type = 'dividend_payout'   AND ktt.txn_code = 'DIVIDEND PAYOUT')   OR
      (t.txn_type = 'dividend_reinvest' AND ktt.txn_code = 'DIVIDEND REINVEST')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: Indexes on ki_transactions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ki_txn_folio
    ON ki_transactions(tenant_id, folio_no)
    WHERE folio_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ki_txn_potential_dup
    ON ki_transactions(tenant_id, is_potential_duplicate)
    WHERE is_potential_duplicate = true;

CREATE INDEX IF NOT EXISTS idx_ki_txn_portfolio_flag
    ON ki_transactions(tenant_id, client_id, portfolio_flag)
    WHERE portfolio_flag = false;

CREATE INDEX IF NOT EXISTS idx_ki_txn_type_id
    ON ki_transactions(txn_type_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: ki_corrections table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ki_corrections (
    id              BIGSERIAL     PRIMARY KEY,
    tenant_id       UUID          NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN       NOT NULL DEFAULT true,
    correction_type TEXT          NOT NULL CHECK (correction_type IN (
        'scheme_remap', 'folio_merge', 'txn_type_fix',
        'duplicate_purge', 'nav_correction', 'manual_adjustment'
    )),
    source_value    TEXT          NOT NULL,
    target_value    TEXT,
    client_id       INTEGER       REFERENCES ki_clients(id),
    folio_no        TEXT,
    affected_txn_count    INTEGER DEFAULT 0,
    affected_holding_rows INTEGER DEFAULT 0,
    status          TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft', 'previewed', 'executing', 'completed', 'rolled_back', 'failed'
    )),
    initiated_by    UUID          NOT NULL REFERENCES vn_users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    rolled_back_at  TIMESTAMPTZ
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'ki_corrections' AND policyname = 'corrections_tenant_isolation'
    ) THEN
        ALTER TABLE ki_corrections ENABLE ROW LEVEL SECURITY;
        CREATE POLICY corrections_tenant_isolation ON ki_corrections
            USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ki_corrections_tenant
    ON ki_corrections(tenant_id, is_live, status);

CREATE INDEX IF NOT EXISTS idx_ki_corrections_client
    ON ki_corrections(tenant_id, client_id)
    WHERE client_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: ki_correction_steps table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ki_correction_steps (
    id              BIGSERIAL     PRIMARY KEY,
    correction_id   BIGINT        NOT NULL REFERENCES ki_corrections(id) ON DELETE CASCADE,
    tenant_id       UUID          NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    step_order      SMALLINT      NOT NULL,
    step_name       TEXT          NOT NULL,
    step_key        TEXT          NOT NULL CHECK (step_key IN (
        'backup_snapshot', 'update_transactions', 'recalculate_holdings',
        'verify_holdings', 'update_scheme_ref', 'purge_duplicates',
        'nav_recalculate', 'log_outcome'
    )),
    status          TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'skipped', 'failed', 'rolled_back'
    )),
    rows_affected   INTEGER       DEFAULT 0,
    error_message   TEXT,
    before_snapshot JSONB,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ki_corr_steps_correction
    ON ki_correction_steps(correction_id, step_order);

CREATE INDEX IF NOT EXISTS idx_ki_corr_steps_tenant
    ON ki_correction_steps(tenant_id, status)
    WHERE status IN ('running', 'failed');


-- ─────────────────────────────────────────────────────────────────────────────
-- From 042: Auto-update trigger on ki_corrections.updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ki_corrections_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ki_corrections_updated_at ON ki_corrections;
CREATE TRIGGER trg_ki_corrections_updated_at
    BEFORE UPDATE ON ki_corrections
    FOR EACH ROW EXECUTE FUNCTION ki_corrections_updated_at();


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: ki_normalize_contact_name()
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ki_normalize_contact_name(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RETURN NULL;
    END IF;

    RETURN UPPER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(
                REGEXP_REPLACE(
                    REGEXP_REPLACE(p_name,
                        '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
                    '[^A-Z0-9\s]', '', 'g'),
                '\s+', ' ', 'g'),
            '^\s+|\s+$', '', 'g')
    );
END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: Add 'orphan' to ki_import_staging.processing_status CHECK
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM pg_constraint
    WHERE conrelid = 'ki_import_staging'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%processing_status%';

    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_import_staging DROP CONSTRAINT ' || quote_ident(v_cname);
    END IF;
END $$;

ALTER TABLE ki_import_staging
    ADD CONSTRAINT ki_import_staging_processing_status_check
    CHECK (processing_status IN (
        'pending', 'processing', 'success', 'failed',
        'duplicate', 'skipped', 'orphan'
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: Add 'new_scheme_detected' to ki_alerts.alert_type CHECK
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM pg_constraint
    WHERE conrelid = 'ki_alerts'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%alert_type%';

    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_alerts DROP CONSTRAINT ' || quote_ident(v_cname);
    END IF;
END $$;

ALTER TABLE ki_alerts
    ADD CONSTRAINT ki_alerts_alert_type_check
    CHECK (alert_type IN (
        'rebalance_needed', 'sip_at_risk', 'goal_behind',
        'tax_harvest_opportunity', 'review_due', 'large_redemption',
        'new_nfo_match', 'sip_bounced', 'nav_drop', 'new_scheme_detected'
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: Update ki_holdings UNIQUE to include is_live
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM pg_constraint
    WHERE conrelid = 'ki_holdings'::regclass
      AND contype  = 'u'
      AND pg_get_constraintdef(oid) LIKE '%client_id%scheme_code%'
      AND pg_get_constraintdef(oid) NOT LIKE '%is_live%';

    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_holdings DROP CONSTRAINT ' || quote_ident(v_cname);
        RAISE NOTICE '[046] Dropped old ki_holdings UNIQUE (without is_live): %', v_cname;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'ki_holdings'::regclass
          AND conname  = 'uq_ki_holdings_env'
    ) THEN
        ALTER TABLE ki_holdings
            ADD CONSTRAINT uq_ki_holdings_env
            UNIQUE (tenant_id, is_live, client_id, portfolio_id, scheme_code);
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: Make ki_transactions.txn_type nullable
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ki_transactions ALTER COLUMN txn_type DROP NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 043: Drop ki_transactions.source CHECK constraint
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM pg_constraint
    WHERE conrelid = 'ki_transactions'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%source%manual%';

    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_transactions DROP CONSTRAINT ' || quote_ident(v_cname);
        RAISE NOTICE '[046] Dropped ki_transactions source CHECK: %', v_cname;
    END IF;
END $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 044: Add orphan_records to ki_import_sessions
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE ki_import_sessions
    ADD COLUMN IF NOT EXISTS orphan_records INTEGER NOT NULL DEFAULT 0;


-- ─────────────────────────────────────────────────────────────────────────────
-- From 045: ki_process_txn_import_session() RPC (fixed JSONB key names)
--
-- Key fixes vs. original 045 draft:
--   mapped_data->>'amount'       (not 'total_amount')
--   mapped_data->>'arn_code'     (not 'arn_no')
--   mapped_data->>'folio_number' (not 'folio_no')
--   mapped_data->>'sip_reg_date' (not 'sip_regd_date')
--   mapped_data->>'description'  (not 'txn_description')
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION ki_process_txn_import_session(
    p_session_id INTEGER
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
BEGIN

    SELECT s.tenant_id, s.is_live, s.created_by
    INTO   v_tenant_id, v_is_live, v_creator_id
    FROM   ki_import_sessions s
    WHERE  s.id = p_session_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION '[ki_process_txn_import_session] Session % not found', p_session_id;
    END IF;

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

            -- STEP 1: CLIENT LOOKUP
            IF v_staging.mapped_data->>'vendor_code' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'vendor_code') <> ''
            THEN
                SELECT c.id INTO v_client_id
                FROM   ki_clients c
                WHERE  c.tenant_id = v_tenant_id
                  AND  c.is_live   = v_is_live
                  AND  c.is_active = true
                  AND  UPPER(TRIM(c.ext_ref_id)) = UPPER(TRIM(v_staging.mapped_data->>'vendor_code'))
                LIMIT  1;
            END IF;

            IF v_client_id IS NULL
               AND v_staging.mapped_data->>'pan' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'pan') <> ''
            THEN
                SELECT c.id INTO v_client_id
                FROM   ki_clients c
                WHERE  c.tenant_id = v_tenant_id
                  AND  c.is_live   = v_is_live
                  AND  c.is_active = true
                  AND  UPPER(TRIM(c.pan)) = UPPER(TRIM(v_staging.mapped_data->>'pan'))
                LIMIT  1;
            END IF;

            IF v_client_id IS NULL
               AND v_staging.mapped_data->>'customer_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'customer_name') <> ''
            THEN
                SELECT c.id INTO v_client_id
                FROM   ki_clients  c
                JOIN   ki_contacts ct ON ct.id = c.contact_id
                WHERE  c.tenant_id  = v_tenant_id
                  AND  c.is_live    = v_is_live
                  AND  c.is_active  = true
                  AND  ct.is_active = true
                  AND  ct.normalized_name =
                           ki_normalize_contact_name(v_staging.mapped_data->>'customer_name')
                LIMIT  1;
            END IF;

            IF v_client_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'orphan',
                       error_messages    = ARRAY[
                           'No matching client found. Tried vendor_code=' ||
                           COALESCE(v_staging.mapped_data->>'vendor_code', 'NULL') ||
                           ', PAN=' || COALESCE(v_staging.mapped_data->>'pan', 'NULL') ||
                           ', name=' || COALESCE(v_staging.mapped_data->>'customer_name', 'NULL')
                       ],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_orphans   := v_orphans   + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- STEP 2: TRANSACTION TYPE LOOKUP
            IF v_staging.mapped_data->>'txn_code' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'txn_code') <> ''
            THEN
                SELECT id INTO v_txn_type_id
                FROM   ki_transaction_types
                WHERE  UPPER(TRIM(txn_code)) = UPPER(TRIM(v_staging.mapped_data->>'txn_code'))
                  AND  is_active = true
                LIMIT  1;

                IF v_txn_type_id IS NULL THEN
                    SELECT id INTO v_txn_type_id
                    FROM   ki_transaction_types
                    WHERE  UPPER(TRIM(txn_name)) = UPPER(TRIM(v_staging.mapped_data->>'txn_code'))
                      AND  is_active = true
                    LIMIT  1;
                END IF;
            END IF;

            IF v_txn_type_id IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY[
                           'Unknown transaction type: ' ||
                           COALESCE(v_staging.mapped_data->>'txn_code', 'NULL')
                       ],
                       processed_at = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed    + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- STEP 3: SCHEME LOOKUP (must be bookmarked)
            IF v_staging.mapped_data->>'scheme_name' IS NOT NULL
               AND TRIM(v_staging.mapped_data->>'scheme_name') <> ''
            THEN
                SELECT sa.scheme_code, sa.scheme_name
                INTO   v_scheme_code, v_scheme_name
                FROM   lookup_scheme_by_alias(v_staging.mapped_data->>'scheme_name') sa;

                IF v_scheme_code IS NOT NULL THEN
                    IF NOT EXISTS (
                        SELECT 1 FROM ki_scheme_bookmarks
                        WHERE tenant_id   = v_tenant_id
                          AND scheme_code = v_scheme_code
                    ) THEN
                        v_error_msg   := 'Scheme not bookmarked by tenant: ' ||
                                         COALESCE(v_scheme_name, v_staging.mapped_data->>'scheme_name');
                        v_scheme_code := NULL;
                    END IF;
                ELSE
                    v_error_msg := 'Scheme not in alias table: ' || (v_staging.mapped_data->>'scheme_name');
                END IF;
            ELSE
                v_error_msg := 'scheme_name is required but missing';
            END IF;

            IF v_scheme_code IS NULL THEN
                UPDATE ki_import_staging
                SET    processing_status = 'failed',
                       error_messages    = ARRAY[v_error_msg],
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_failed    := v_failed    + 1;
                v_processed := v_processed + 1;
                CONTINUE;
            END IF;

            -- STEP 4: DUPLICATE CHECK
            v_txn_amount := COALESCE(
                NULLIF(TRIM(v_staging.mapped_data->>'amount'), '')::NUMERIC,
                0
            );

            IF EXISTS (
                SELECT 1 FROM ki_transactions
                WHERE  tenant_id   = v_tenant_id
                  AND  is_live     = v_is_live
                  AND  client_id   = v_client_id
                  AND  scheme_code = v_scheme_code
                  AND  txn_date    = (v_staging.mapped_data->>'txn_date')::DATE
                  AND  amount      = v_txn_amount
                  AND  units       = COALESCE(
                                         NULLIF(TRIM(v_staging.mapped_data->>'units'), '')::NUMERIC,
                                         0
                                     )
            ) THEN
                UPDATE ki_import_staging
                SET    processing_status = 'duplicate',
                       processed_at      = NOW()
                WHERE  id = v_staging.id;
                v_duplicates := v_duplicates + 1;
                v_processed  := v_processed  + 1;
                CONTINUE;
            END IF;

            -- STEP 5: GET / CREATE CLIENT PORTFOLIO
            SELECT id INTO v_portfolio_id
            FROM   ki_portfolios
            WHERE  tenant_id = v_tenant_id
              AND  client_id = v_client_id
              AND  is_live   = v_is_live
              AND  active    = true
            ORDER  BY id
            LIMIT  1;

            IF v_portfolio_id IS NULL THEN
                INSERT INTO ki_portfolios (tenant_id, is_live, client_id, name, portfolio_type)
                VALUES (v_tenant_id, v_is_live, v_client_id, 'Default', 'regular')
                RETURNING id INTO v_portfolio_id;
            END IF;

            -- STEP 6: UPSERT ki_holdings
            v_is_new_holding := NOT EXISTS (
                SELECT 1 FROM ki_holdings
                WHERE  tenant_id   = v_tenant_id
                  AND  is_live     = v_is_live
                  AND  client_id   = v_client_id
                  AND  scheme_code = v_scheme_code
            );

            INSERT INTO ki_holdings (
                tenant_id, is_live, client_id, portfolio_id, scheme_code,
                units, total_invested, is_sip, sip_start_date, updated_at
            ) VALUES (
                v_tenant_id, v_is_live, v_client_id, v_portfolio_id, v_scheme_code,
                0, 0, false,
                (v_staging.mapped_data->>'txn_date')::DATE,
                NOW()
            )
            ON CONFLICT (tenant_id, is_live, client_id, portfolio_id, scheme_code)
            DO UPDATE SET updated_at = NOW();

            -- STEP 7: INSERT TRANSACTION (fixed JSONB keys: amount, arn_code,
            --         folio_number, sip_reg_date, description)
            INSERT INTO ki_transactions (
                tenant_id, is_live,
                client_id, portfolio_id, scheme_code,
                txn_type_id, txn_date,
                amount, units, nav,
                stamp_duty, stt, tds,
                euin, arn, folio_no,
                fund_name, category, sip_reg_date,
                description, source, source_ref,
                is_potential_duplicate, portfolio_flag,
                created_at
            ) VALUES (
                v_tenant_id, v_is_live,
                v_client_id, v_portfolio_id, v_scheme_code,
                v_txn_type_id,
                (v_staging.mapped_data->>'txn_date')::DATE,
                v_txn_amount,
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'units'),       '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'nav'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stamp_duty'),   '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'stt'),          '')::NUMERIC, 0),
                COALESCE(NULLIF(TRIM(v_staging.mapped_data->>'tds'),          '')::NUMERIC, 0),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'euin',          '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'arn_code',      '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'folio_number',  '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'fund_name',     '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'category',      '')), ''),
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'sip_reg_date',  '')), '')::DATE,
                NULLIF(TRIM(COALESCE(v_staging.mapped_data->>'description',   '')), ''),
                'import',
                v_staging.id::TEXT,
                false,
                true,
                NOW()
            )
            RETURNING id INTO v_txn_id;

            -- STEP 8: NEW SCHEME ALERT
            IF v_is_new_holding THEN
                INSERT INTO ki_alerts (
                    tenant_id, is_live, client_id,
                    alert_type, priority, title, body,
                    action_skill, action_function, action_params,
                    created_at
                ) VALUES (
                    v_tenant_id, v_is_live, v_client_id,
                    'new_scheme_detected', 'medium',
                    'New MF detected: ' || v_scheme_name,
                    'Scheme "' || v_scheme_name || '" has appeared for the first time ' ||
                    'in imported transactions. Please review the investment plan for this client.',
                    'transaction-skill', 'get_transactions',
                    jsonb_build_object(
                        'client_id',   v_client_id,
                        'scheme_code', v_scheme_code,
                        'txn_id',      v_txn_id,
                        'session_id',  p_session_id
                    ),
                    NOW()
                );
            END IF;

            UPDATE ki_import_staging
            SET    processing_status    = 'success',
                   created_record_id    = v_txn_id::TEXT,
                   created_record_type  = 'transaction',
                   processed_at         = NOW()
            WHERE  id = v_staging.id;

            v_success   := v_success   + 1;
            v_processed := v_processed + 1;

        EXCEPTION WHEN OTHERS THEN
            UPDATE ki_import_staging
            SET    processing_status = 'failed',
                   error_messages    = ARRAY[SQLERRM],
                   processed_at      = NOW()
            WHERE  id = v_staging.id;

            v_failed    := v_failed    + 1;
            v_processed := v_processed + 1;
        END;

        -- Batch checkpoint every 500 rows
        IF v_processed % v_batch_size = 0 THEN
            UPDATE ki_import_sessions
            SET    successful_records = v_success,
                   failed_records     = v_failed,
                   orphan_records     = v_orphans,
                   duplicate_records  = v_duplicates,
                   processed_records  = v_processed,
                   updated_at         = NOW()
            WHERE  id = p_session_id;
        END IF;

    END LOOP;

    UPDATE ki_import_sessions
    SET    status = CASE
               WHEN v_failed + v_orphans > 0 THEN 'completed_with_errors'
               ELSE 'completed'
           END,
           successful_records      = v_success,
           failed_records          = v_failed,
           orphan_records          = v_orphans,
           duplicate_records       = v_duplicates,
           processed_records       = v_processed,
           processing_completed_at = NOW(),
           updated_at              = NOW()
    WHERE  id = p_session_id;

    RETURN QUERY
    SELECT v_processed, v_success, v_failed, v_duplicates, v_orphans,
           EXTRACT(EPOCH FROM (NOW() - v_start_time))::NUMERIC;

END;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    RAISE NOTICE '[046] ki_transactions: txn_type_id, folio_no, fund_name, category, tds, euin, arn, sip_reg_date, description, is_potential_duplicate, portfolio_flag columns ensured';
    RAISE NOTICE '[046] ki_corrections, ki_correction_steps: tables ensured';
    RAISE NOTICE '[046] ki_import_sessions.orphan_records: column ensured';
    RAISE NOTICE '[046] ki_normalize_contact_name(): created/updated';
    RAISE NOTICE '[046] ki_process_txn_import_session(): created/updated with fixed JSONB keys';
    RAISE NOTICE '[046] All schema safety-net patches from 042–045 applied.';
END;
$$;

COMMIT;
