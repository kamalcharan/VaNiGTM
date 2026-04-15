-- ============================================================
-- 043_ki_client_codes.sql
--
-- 1. ki_client_codes  — maps tenant clients to vendor-specific codes
--                       (InvestWell, CAMS, KFintech, MFU, NSE, BSE, …)
-- 2. ki_normalize_contact_name()  — mirrors ki_contacts.normalized_name
--                                    generated column; used by import RPC
--                                    for name-based client lookup
-- 3. Backfill ki_client_codes from ki_clients.ext_ref_id (vendor='investwell')
-- 4. Schema prep for transaction import:
--      a) Add 'orphan' to ki_import_staging.processing_status CHECK
--      b) Add 'new_scheme_detected' to ki_alerts.alert_type CHECK
--      c) Update ki_holdings UNIQUE to include is_live (environment isolation)
--      d) Make ki_transactions.txn_type nullable (superseded by txn_type_id)
--      e) Drop ki_transactions.source CHECK (allow 'import' and any vendor string)
--
-- ADDITIVE — no data loss, no column drops.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: ki_client_codes
-- One client can have codes from multiple vendors (one per vendor per client).
-- UNIQUE (tenant_id, vendor, vendor_code): a given code in a vendor namespace
-- can only belong to ONE client per tenant.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_client_codes (
    id          BIGSERIAL    PRIMARY KEY,
    tenant_id   UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    client_id   INTEGER      NOT NULL REFERENCES ki_clients(id) ON DELETE CASCADE,

    -- Vendor identifier — any string; common values:
    -- 'investwell' | 'cams' | 'kfintech' | 'mfu' | 'nse' | 'bse' | 'zerodha'
    vendor      TEXT         NOT NULL,

    -- The client code as it appears in that vendor's files / platform
    vendor_code TEXT         NOT NULL,

    -- Primary code for this vendor (in case a client has multiple codes at one vendor)
    is_primary  BOOLEAN      NOT NULL DEFAULT false,

    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    -- A given vendor_code in a given vendor namespace belongs to exactly ONE client per tenant
    CONSTRAINT uq_ki_client_codes_vendor UNIQUE (tenant_id, vendor, vendor_code)
);

COMMENT ON TABLE  ki_client_codes             IS 'Maps tenant clients to vendor-specific reference codes for import matching';
COMMENT ON COLUMN ki_client_codes.vendor      IS 'Vendor namespace: investwell, cams, kfintech, mfu, nse, bse, etc.';
COMMENT ON COLUMN ki_client_codes.vendor_code IS 'The code as it appears in the vendor file (e.g., IWELL CODE = 373824)';
COMMENT ON COLUMN ki_client_codes.is_primary  IS 'If a client has multiple codes at one vendor, marks the canonical one';

CREATE INDEX IF NOT EXISTS idx_ki_client_codes_lookup
    ON ki_client_codes(tenant_id, vendor, vendor_code);

CREATE INDEX IF NOT EXISTS idx_ki_client_codes_client
    ON ki_client_codes(tenant_id, client_id);

ALTER TABLE ki_client_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY ki_client_codes_tenant_isolation ON ki_client_codes
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: ki_normalize_contact_name()
--
-- Mirrors the GENERATED ALWAYS AS formula in ki_contacts.normalized_name.
-- Called by the import RPC to normalize the customer name from the import
-- file before comparing against stored normalized_name values.
--
-- Formula: uppercase → strip leading title (MR/MRS/MS/DR/PROF/SRI/SMT)
--          → remove non-alphanumeric → collapse whitespace → trim
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

COMMENT ON FUNCTION ki_normalize_contact_name IS
'Normalize a contact name for import matching. Mirrors the ki_contacts.normalized_name
 generated column: strip title prefix, uppercase, remove special chars, collapse spaces.
 IMMUTABLE — safe in indexes. Used by ki_process_txn_import_session() for name lookup.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Backfill ki_client_codes from ki_clients.ext_ref_id
-- ext_ref_id stored InvestWell codes before ki_client_codes existed.
-- Only backfill rows where ext_ref_id is non-null and non-empty.
-- ON CONFLICT DO NOTHING — idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO ki_client_codes (tenant_id, client_id, vendor, vendor_code, is_primary)
SELECT
    tenant_id,
    id,
    'investwell',
    TRIM(ext_ref_id),
    true   -- mark as primary since it was the only code
FROM ki_clients
WHERE ext_ref_id IS NOT NULL
  AND TRIM(ext_ref_id) != ''
ON CONFLICT (tenant_id, vendor, vendor_code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4a: Add 'orphan' status to ki_import_staging.processing_status
-- 'orphan' = staging row was processed but no matching client was found.
-- Different from 'failed' (technical error) — orphans are re-processable
-- once the client is added or the vendor code is mapped.
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
        'pending',
        'processing',
        'success',
        'failed',
        'duplicate',
        'skipped',
        'orphan'    -- no matching client found; re-processable once client is added
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4b: Add 'new_scheme_detected' to ki_alerts.alert_type
-- Created automatically by ki_process_txn_import_session() when a client's
-- first transaction for a scheme is imported — signals the advisor to review
-- the investment plan for this client.
-- NOTE: ki_alerts will be renamed to ki_pulses in a future feature (Pulses).
--       See CLAUDE.md Lessons Learned #15.
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
        'rebalance_needed',
        'sip_at_risk',
        'goal_behind',
        'tax_harvest_opportunity',
        'review_due',
        'large_redemption',
        'new_nfo_match',
        'sip_bounced',
        'nav_drop',
        'new_scheme_detected'   -- auto-created during transaction import (first txn for a scheme)
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4c: Update ki_holdings UNIQUE to include is_live
-- The original UNIQUE (tenant_id, client_id, portfolio_id, scheme_code) does
-- not separate live/sandbox holdings. Two imports in different environments
-- would conflict. Adding is_live makes them properly isolated.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE v_cname TEXT;
BEGIN
    SELECT conname INTO v_cname
    FROM pg_constraint
    WHERE conrelid = 'ki_holdings'::regclass
      AND contype  = 'u'
      AND pg_get_constraintdef(oid) LIKE '%client_id%scheme_code%';

    IF v_cname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE ki_holdings DROP CONSTRAINT ' || quote_ident(v_cname);
        RAISE NOTICE '[043] Dropped old ki_holdings UNIQUE constraint: %', v_cname;
    END IF;
END $$;

ALTER TABLE ki_holdings
    ADD CONSTRAINT uq_ki_holdings_env
    UNIQUE (tenant_id, is_live, client_id, portfolio_id, scheme_code);

COMMENT ON CONSTRAINT uq_ki_holdings_env ON ki_holdings IS
'One holdings row per (tenant, environment, client, portfolio, scheme). is_live isolates sandbox from live.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4d: Make ki_transactions.txn_type nullable
-- txn_type (TEXT, legacy) is superseded by txn_type_id (FK to ki_transaction_types)
-- added in migration 042. New rows from import will use txn_type_id and leave
-- txn_type NULL. The column will be dropped in a future migration.
-- The CHECK constraint accepts NULL implicitly once NOT NULL is removed.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_transactions ALTER COLUMN txn_type DROP NOT NULL;

COMMENT ON COLUMN ki_transactions.txn_type IS
'DEPRECATED: Legacy lowercase txn type string (purchase/redemption/etc). Superseded by
 txn_type_id (FK to ki_transaction_types, added migration 042). Will be dropped in a
 future migration once all code switches to txn_type_id.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4e: Drop ki_transactions.source CHECK constraint
-- Original CHECK allowed: manual | investwell | cas | nse | api
-- Import RPC uses source = 'import' and vendors will grow over time.
-- Dropping the CHECK allows any string. The column value is metadata only.
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
        RAISE NOTICE '[043] Dropped ki_transactions source CHECK: %', v_cname;
    END IF;
END $$;

COMMENT ON COLUMN ki_transactions.source IS
'Origin of the transaction: manual | import | investwell | cas | nse | api | or any vendor string. CHECK removed in migration 043 to allow extensible vendor values.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '[043] ki_client_codes: created (% rows backfilled from ext_ref_id)',
        (SELECT COUNT(*) FROM ki_client_codes);
    RAISE NOTICE '[043] ki_normalize_contact_name(): created';
    RAISE NOTICE '[043] ki_import_staging: added orphan status';
    RAISE NOTICE '[043] ki_alerts: added new_scheme_detected type';
    RAISE NOTICE '[043] ki_holdings: UNIQUE updated to include is_live';
    RAISE NOTICE '[043] ki_transactions: txn_type made nullable, source CHECK dropped';
END;
$$;

COMMIT;
