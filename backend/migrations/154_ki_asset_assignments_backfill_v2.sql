-- ============================================================
-- 054_ki_asset_assignments_backfill_v2.sql
--
-- Previous backfill attempts (052, 053) failed because:
-- - Migration runner has no tenant context → RLS on ki_transactions
--   and ki_holdings filters all rows → CTE returns 0 → 0 inserts.
-- - set_config(..., true) inside a DO block is local to the transaction
--   but ki_transactions RLS reads the setting at query plan time in a
--   way that may not pick up the in-loop changes.
--
-- Fix: SECURITY DEFINER function runs as the DB owner (bypasses RLS
-- entirely). This is a one-time backfill tool: create, execute, drop.
-- ON CONFLICT DO NOTHING makes it safe on a fresh table or re-run.
-- ============================================================

BEGIN;

-- ── Create SECURITY DEFINER backfill function ─────────────────────────────
-- Runs as DB owner → no RLS → can read all tenants' transactions + holdings

CREATE OR REPLACE FUNCTION _ki_backfill_asset_assignments_once()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted INTEGER;
BEGIN
    WITH earliest_txn AS (
        -- Earliest transaction date per (tenant, env, client, scheme)
        SELECT
            t.tenant_id,
            t.is_live,
            t.client_id,
            t.scheme_code,
            MIN(t.txn_date)   AS first_txn_date
        FROM ki_transactions t
        WHERE t.scheme_code IS NOT NULL
        GROUP BY t.tenant_id, t.is_live, t.client_id, t.scheme_code
    ),
    backfill AS (
        SELECT
            e.tenant_id,
            e.is_live,
            e.client_id,
            mf.id                                           AS asset_type_id,
            e.scheme_code,
            CASE WHEN h.is_sip THEN 'sip'
                 ELSE 'one_time'
            END                                             AS investment_type,
            e.first_txn_date                                AS start_date,
            h.sip_amount                                    AS recurring_amount,
            CASE WHEN h.is_sip THEN 'monthly'
                 ELSE NULL
            END                                             AS investment_frequency,
            true                                            AS is_active,
            NOW()                                           AS created_at,
            NOW()                                           AS updated_at
        FROM earliest_txn e
        JOIN ki_holdings h
            ON  h.tenant_id   = e.tenant_id
            AND h.client_id   = e.client_id
            AND h.scheme_code = e.scheme_code
            AND h.units       > 0           -- only active holdings
        JOIN ki_asset_types mf
            ON  mf.asset_type_code = 'MF'  -- never hardcode id=1
    )
    INSERT INTO ki_customer_asset_assignments (
        tenant_id, is_live, client_id, asset_type_id, scheme_code,
        investment_type, start_date, recurring_amount, investment_frequency,
        is_active, created_at, updated_at
    )
    SELECT
        tenant_id, is_live, client_id, asset_type_id, scheme_code,
        investment_type, start_date, recurring_amount, investment_frequency,
        is_active, created_at, updated_at
    FROM backfill
    ON CONFLICT DO NOTHING;

    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    RETURN v_inserted;
END;
$$;

-- ── Execute and immediately drop ──────────────────────────────────────────

DO $$
DECLARE
    v_n INTEGER;
BEGIN
    SELECT _ki_backfill_asset_assignments_once() INTO v_n;
    RAISE NOTICE '[054] Backfill inserted % ki_customer_asset_assignments rows', v_n;
END $$;

DROP FUNCTION _ki_backfill_asset_assignments_once();

COMMIT;

DO $$
DECLARE v_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM ki_customer_asset_assignments;
    RAISE NOTICE '[054] ki_customer_asset_assignments total rows now: %', v_total;
END $$;
