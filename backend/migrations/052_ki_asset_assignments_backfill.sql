-- ============================================================
-- 052_ki_asset_assignments_backfill.sql
--
-- One-time backfill of ki_customer_asset_assignments for MF
-- holdings that existed before migration 051 was applied.
--
-- Logic:
--   1. For each unique (tenant_id, is_live, client_id, scheme_code)
--      that has active transactions (ki_transactions), create one
--      assignment row with:
--        • investment_type = 'sip' if ki_holdings.is_sip = true,
--          else 'one_time'
--        • start_date = earliest txn_date for that scheme/client
--   2. ON CONFLICT DO NOTHING — safe to re-run; existing rows are
--      never overwritten.
--   3. Restricted to schemes where ki_holdings.units > 0 so that
--      fully-redeemed funds don't pollute the Assets tab.
--
-- Run after migrations 050 and 051 when transactions have already
-- been imported but no asset assignments were created yet.
-- ============================================================

BEGIN;

-- ── Step 1: Compute earliest txn date per (tenant, env, client, scheme) ──

WITH earliest_txn AS (
    SELECT
        t.tenant_id,
        t.is_live,
        t.client_id,
        t.scheme_code,
        MIN(t.txn_date)   AS first_txn_date,
        COUNT(*)          AS txn_count
    FROM ki_transactions t
    WHERE t.scheme_code IS NOT NULL
    GROUP BY t.tenant_id, t.is_live, t.client_id, t.scheme_code
),

-- ── Step 2: Join to active holdings (units > 0) and resolve MF asset type ──

backfill AS (
    SELECT
        e.tenant_id,
        e.is_live,
        e.client_id,
        mf.id                                       AS asset_type_id,
        e.scheme_code,
        CASE WHEN h.is_sip THEN 'sip'
             ELSE 'one_time'
        END                                         AS investment_type,
        e.first_txn_date                            AS start_date,
        h.sip_amount                                AS recurring_amount,
        CASE WHEN h.is_sip THEN 'monthly'
             ELSE NULL
        END                                         AS investment_frequency,
        true                                        AS is_active,
        NOW()                                       AS created_at,
        NOW()                                       AS updated_at
    FROM earliest_txn e
    -- Only active holdings (units > 0)
    JOIN ki_holdings h
        ON  h.tenant_id   = e.tenant_id
        AND h.client_id   = e.client_id
        AND h.scheme_code = e.scheme_code
        AND h.units       > 0
    -- MF asset type id (looked up once — never hardcode id=1)
    JOIN ki_asset_types mf
        ON  mf.asset_type_code = 'MF'
)

INSERT INTO ki_customer_asset_assignments (
    tenant_id,
    is_live,
    client_id,
    asset_type_id,
    scheme_code,
    investment_type,
    start_date,
    recurring_amount,
    investment_frequency,
    is_active,
    created_at,
    updated_at
)
SELECT
    tenant_id,
    is_live,
    client_id,
    asset_type_id,
    scheme_code,
    investment_type,
    start_date,
    recurring_amount,
    investment_frequency,
    is_active,
    created_at,
    updated_at
FROM backfill
ON CONFLICT DO NOTHING;

COMMIT;

DO $$
DECLARE
    v_inserted INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_inserted FROM ki_customer_asset_assignments;
    RAISE NOTICE '[052] Backfill complete — % asset assignment rows now in table', v_inserted;
    RAISE NOTICE '[052] Source: ki_transactions × ki_holdings (units > 0) × ki_asset_types (MF)';
    RAISE NOTICE '[052] ON CONFLICT DO NOTHING — safe to re-run';
END $$;
