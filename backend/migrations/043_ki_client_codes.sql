-- ============================================================
-- 043_ki_txn_import_schema_prep.sql
--
-- Schema fixes needed before ki_process_txn_import_session() can run.
-- NOTE: Client vendor codes already exist via:
--   ki_clients.ext_ref_id         — the vendor code per client
--   vn_tenants.ext_ref_type_code  — which vendor this tenant uses (IWELL/CAMS/etc)
--   ki_ext_ref_types              — global vendor master (migration 033)
-- No new vendor-code table needed.
--
-- This migration:
--   1. ki_normalize_contact_name()  — normalize import file name for lookup
--                                     against ki_contacts.normalized_name
--   2. ki_import_staging: add 'orphan' to processing_status CHECK
--   3. ki_alerts: add 'new_scheme_detected' to alert_type CHECK
--   4. ki_holdings: update UNIQUE to include is_live (environment isolation)
--   5. ki_transactions: make txn_type nullable (superseded by txn_type_id)
--   6. ki_transactions: drop source CHECK (allow 'import' and any string)
--
-- ADDITIVE — no data loss, no column drops.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: ki_normalize_contact_name()
--
-- Mirrors the GENERATED ALWAYS AS formula in ki_contacts.normalized_name.
-- Called by the import RPC to normalize the customer_name field from the
-- import file before comparing against stored normalized_name values.
--
-- Formula: strip leading title → remove non-alphanumeric → collapse spaces → uppercase
-- Must match the generated column exactly for lookups to work.
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
 generated column exactly: strip title prefix, uppercase, remove special chars, collapse
 spaces. IMMUTABLE — safe in indexes. Used by ki_process_txn_import_session() for
 name-based client lookup.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Add 'orphan' to ki_import_staging.processing_status
-- orphan = no matching client found (ext_ref_id + PAN + name all failed).
-- Re-processable once the client record or ext_ref_id is corrected.
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
        'orphan'    -- no matching client; re-processable after client/code fix
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Add 'new_scheme_detected' to ki_alerts.alert_type
-- Created by ki_process_txn_import_session() when a client's first transaction
-- for a scheme is imported — signals advisor to review investment plan.
-- NOTE: ki_alerts may be renamed ki_pulses in a future release (CLAUDE.md #15).
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
        'new_scheme_detected'   -- first transaction for a scheme detected during import
    ));


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Update ki_holdings UNIQUE constraint to include is_live
-- Original: UNIQUE(tenant_id, client_id, portfolio_id, scheme_code)
-- Problem:  sandbox and live holdings for the same client+scheme conflict.
-- Fix:      add is_live so each environment has its own holdings row.
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
        RAISE NOTICE '[043] Dropped old ki_holdings UNIQUE: %', v_cname;
    END IF;
END $$;

ALTER TABLE ki_holdings
    ADD CONSTRAINT uq_ki_holdings_env
    UNIQUE (tenant_id, is_live, client_id, portfolio_id, scheme_code);

COMMENT ON CONSTRAINT uq_ki_holdings_env ON ki_holdings IS
'One holdings row per (tenant, environment, client, portfolio, scheme). is_live added in
 migration 043 to properly isolate sandbox from live holdings.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Make ki_transactions.txn_type nullable
-- txn_type TEXT was the legacy type column (purchase/redemption/etc).
-- Superseded by txn_type_id FK (migration 042). New import rows use
-- txn_type_id and leave txn_type NULL. Will be dropped in a future migration.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_transactions ALTER COLUMN txn_type DROP NOT NULL;

COMMENT ON COLUMN ki_transactions.txn_type IS
'DEPRECATED: Legacy lowercase type string. Superseded by txn_type_id (migration 042).
 Made nullable in migration 043. Will be dropped in a future migration.';


-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Drop ki_transactions.source CHECK
-- Original allowed: manual | investwell | cas | nse | api
-- Import RPC uses source = 'import'. Vendors grow over time.
-- Dropping CHECK allows any string — column is metadata only.
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
'Origin string: manual | import | investwell | cas | nse | api | (any vendor string).
 CHECK removed in migration 043 to allow extensible vendor values.';


-- ─────────────────────────────────────────────────────────────────────────────
-- Verify
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    RAISE NOTICE '[043] ki_normalize_contact_name(): created';
    RAISE NOTICE '[043] ki_import_staging: added orphan status to CHECK';
    RAISE NOTICE '[043] ki_alerts: added new_scheme_detected to CHECK';
    RAISE NOTICE '[043] ki_holdings: UNIQUE updated to include is_live';
    RAISE NOTICE '[043] ki_transactions: txn_type made nullable';
    RAISE NOTICE '[043] ki_transactions: source CHECK dropped';
    RAISE NOTICE '[043] Client vendor codes: using existing ki_clients.ext_ref_id + vn_tenants.ext_ref_type_code';
END;
$$;

COMMIT;
