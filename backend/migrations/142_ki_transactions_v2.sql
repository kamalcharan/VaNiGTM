-- ============================================================
-- 042_ki_transactions_v2.sql
-- Extend ki_transactions with full import field set.
-- Add ki_corrections + ki_correction_steps for course correction.
--
-- ADDITIVE ONLY — no data loss, no column drops.
-- txn_type (TEXT) kept for backward compat; txn_type_id (FK) added.
-- txn_type will be dropped in a future migration once all import
-- code switches to txn_type_id.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Add dividend types to ki_transaction_types master
-- (PURCHASE, REDEMPTION etc. already seeded in 017_ki_master_data.sql)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO ki_transaction_types (txn_code, txn_name, txn_type, is_active, description)
VALUES
    ('DIVIDEND PAYOUT',   'Dividend Payout',        'Deduction', true,
     'Cash dividend paid out to investor bank account'),
    ('DIVIDEND REINVEST', 'Dividend Reinvestment',   'Addition',  true,
     'Dividend reinvested as additional units in the same scheme')
ON CONFLICT (txn_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Extend ki_transactions — new import & ops columns
-- ─────────────────────────────────────────────────────────────────────────────

-- Existing columns as of this migration:
--   id, tenant_id, client_id, portfolio_id, scheme_code,
--   txn_type (TEXT CHECK), txn_date, amount, units, nav,
--   stamp_duty, stt, source, source_ref, created_at, is_live

-- description was referenced by insert-transactions.sql but never created — add it now.
ALTER TABLE ki_transactions
    ADD COLUMN IF NOT EXISTS description           TEXT,
    ADD COLUMN IF NOT EXISTS folio_no              TEXT,
    ADD COLUMN IF NOT EXISTS fund_name             TEXT,
    ADD COLUMN IF NOT EXISTS category              TEXT,
    ADD COLUMN IF NOT EXISTS tds                   NUMERIC(10,2)  NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS euin                  TEXT,
    ADD COLUMN IF NOT EXISTS arn                   TEXT,
    ADD COLUMN IF NOT EXISTS sip_reg_date          DATE,
    ADD COLUMN IF NOT EXISTS is_potential_duplicate BOOLEAN       NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS portfolio_flag        BOOLEAN        NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS txn_type_id           INTEGER        REFERENCES ki_transaction_types(id);

COMMENT ON COLUMN ki_transactions.folio_no              IS 'Folio number from registrar (CAMS/KFintech)';
COMMENT ON COLUMN ki_transactions.fund_name             IS 'Fund house name from import file (denormalised for display)';
COMMENT ON COLUMN ki_transactions.category              IS 'Scheme category at time of transaction (denormalised)';
COMMENT ON COLUMN ki_transactions.tds                   IS 'TDS deducted on this transaction (debt redemptions)';
COMMENT ON COLUMN ki_transactions.euin                  IS 'EUIN of the advisor/employee who processed this transaction';
COMMENT ON COLUMN ki_transactions.arn                   IS 'ARN of the distributor (from import file)';
COMMENT ON COLUMN ki_transactions.sip_reg_date          IS 'SIP registration date (present on SIP transactions)';
COMMENT ON COLUMN ki_transactions.description           IS 'Free-text description or import narration';
COMMENT ON COLUMN ki_transactions.is_potential_duplicate IS 'Flagged by dedup engine — awaits manual review';
COMMENT ON COLUMN ki_transactions.portfolio_flag        IS 'Include in portfolio calculations (false = excluded, manual override)';
COMMENT ON COLUMN ki_transactions.txn_type_id           IS 'FK to ki_transaction_types — replaces txn_type TEXT in future migration';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Backfill txn_type_id for existing rows
-- Maps old CHECK constraint values → ki_transaction_types.id
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
-- STEP 4: Operational indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Fast lookup for folio-based reconciliation
CREATE INDEX IF NOT EXISTS idx_ki_txn_folio
    ON ki_transactions(tenant_id, folio_no)
    WHERE folio_no IS NOT NULL;

-- Duplicate triage queue
CREATE INDEX IF NOT EXISTS idx_ki_txn_potential_dup
    ON ki_transactions(tenant_id, is_potential_duplicate)
    WHERE is_potential_duplicate = true;

-- Portfolio calculation exclusion (excluded transactions)
CREATE INDEX IF NOT EXISTS idx_ki_txn_portfolio_flag
    ON ki_transactions(tenant_id, client_id, portfolio_flag)
    WHERE portfolio_flag = false;

-- txn_type_id join
CREATE INDEX IF NOT EXISTS idx_ki_txn_type_id
    ON ki_transactions(txn_type_id);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: ki_corrections — course correction campaigns
-- One record per correction campaign (e.g. "Fix wrong scheme code ABC→XYZ")
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ki_corrections (
    id              BIGSERIAL     PRIMARY KEY,
    tenant_id       UUID          NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    is_live         BOOLEAN       NOT NULL DEFAULT true,

    -- What kind of correction
    correction_type TEXT          NOT NULL CHECK (correction_type IN (
        'scheme_remap',        -- Wrong scheme_code → correct scheme_code
        'folio_merge',         -- Two folio records are the same folio
        'txn_type_fix',        -- Wrong txn_type assigned during import
        'duplicate_purge',     -- Remove confirmed duplicate transactions
        'nav_correction',      -- NAV value was wrong at import time
        'manual_adjustment'    -- Catch-all manual correction
    )),

    -- Subject of the correction
    source_value    TEXT          NOT NULL,   -- E.g. wrong scheme_code
    target_value    TEXT,                     -- E.g. correct scheme_code (null for purge)
    client_id       INTEGER       REFERENCES ki_clients(id),  -- null = all clients
    folio_no        TEXT,                     -- null = all folios

    -- Scope preview (populated before execution)
    affected_txn_count    INTEGER DEFAULT 0,
    affected_holding_rows INTEGER DEFAULT 0,

    -- State machine
    status          TEXT          NOT NULL DEFAULT 'draft' CHECK (status IN (
        'draft',       -- Being configured
        'previewed',   -- Dry-run completed, awaiting confirmation
        'executing',   -- In progress
        'completed',   -- All steps done
        'rolled_back', -- Rolled back successfully
        'failed'       -- Unrecoverable failure
    )),

    -- Audit
    initiated_by    UUID          NOT NULL REFERENCES vn_users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ,
    rolled_back_at  TIMESTAMPTZ
);

ALTER TABLE ki_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY corrections_tenant_isolation ON ki_corrections
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

COMMENT ON TABLE  ki_corrections IS 'Course correction campaigns — tracks multi-step data repair operations';
COMMENT ON COLUMN ki_corrections.source_value IS 'The incorrect value to be fixed (e.g., wrong scheme_code)';
COMMENT ON COLUMN ki_corrections.target_value IS 'The correct replacement value';
COMMENT ON COLUMN ki_corrections.affected_txn_count IS 'Preview count: transactions that will be updated';

CREATE INDEX IF NOT EXISTS idx_ki_corrections_tenant
    ON ki_corrections(tenant_id, is_live, status);

CREATE INDEX IF NOT EXISTS idx_ki_corrections_client
    ON ki_corrections(tenant_id, client_id)
    WHERE client_id IS NOT NULL;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: ki_correction_steps — individual steps within a correction
-- Each step is one atomic DB operation with full before/after audit
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ki_correction_steps (
    id              BIGSERIAL     PRIMARY KEY,
    correction_id   BIGINT        NOT NULL REFERENCES ki_corrections(id) ON DELETE CASCADE,
    tenant_id       UUID          NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    step_order      SMALLINT      NOT NULL,
    step_name       TEXT          NOT NULL,   -- Human label (e.g. "Update transactions")
    step_key        TEXT          NOT NULL CHECK (step_key IN (
        'backup_snapshot',       -- Capture pre-state rows
        'update_transactions',   -- ALTER ki_transactions rows
        'recalculate_holdings',  -- Rebuild ki_holdings from transactions
        'verify_holdings',       -- Sanity check unit/value totals
        'update_scheme_ref',     -- Update scheme_code in ki_holdings directly
        'purge_duplicates',      -- DELETE confirmed duplicate rows
        'nav_recalculate',       -- Recalculate nav-derived fields
        'log_outcome'            -- Write final audit record
    )),

    -- Result
    status          TEXT          NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending', 'running', 'completed', 'skipped', 'failed', 'rolled_back'
    )),
    rows_affected   INTEGER       DEFAULT 0,
    error_message   TEXT,

    -- Snapshot for rollback (JSONB — stores affected row PKs + old values)
    before_snapshot JSONB,

    -- Timing
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  ki_correction_steps IS 'Step-by-step execution log for each correction campaign';
COMMENT ON COLUMN ki_correction_steps.before_snapshot IS 'JSONB snapshot of rows before this step — enables rollback';

CREATE INDEX IF NOT EXISTS idx_ki_corr_steps_correction
    ON ki_correction_steps(correction_id, step_order);

CREATE INDEX IF NOT EXISTS idx_ki_corr_steps_tenant
    ON ki_correction_steps(tenant_id, status)
    WHERE status IN ('running', 'failed');


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 7: Auto-update updated_at on ki_corrections
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
-- Verify
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
    RAISE NOTICE '[042] ki_transactions: added description, folio_no, fund_name, category, tds, euin, arn, sip_reg_date, is_potential_duplicate, portfolio_flag, txn_type_id';
    RAISE NOTICE '[042] ki_transaction_types: % total types', (SELECT COUNT(*) FROM ki_transaction_types);
    RAISE NOTICE '[042] ki_corrections table: created';
    RAISE NOTICE '[042] ki_correction_steps table: created';
END;
$$;

COMMIT;
