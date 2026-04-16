-- ============================================================
-- 053_ki_fix_tenant_context_and_backfill.sql
--
-- Two fixes in one migration:
--
-- 1. CRITICAL — set_tenant_context() bug:
--    Migration 003 created set_tenant_context() to set
--    app.current_tenant_id. However, the original RLS policies
--    in migration 001 (ki_transactions, ki_holdings, ki_clients,
--    ki_portfolios, etc.) check app.tenant_id — a DIFFERENT setting.
--    set_tenant_context() never set app.tenant_id, so those original
--    RLS policies were always filtering all rows for non-superuser
--    connections. Fix: also set app.tenant_id.
--
-- 2. Re-run backfill from migration 052:
--    The backfill in 052 read from ki_transactions and ki_holdings
--    without any tenant context set (migration runner has no JWT).
--    Those tables' RLS policies return 0 rows without context, so
--    the backfill silently inserted nothing. Fix: loop over tenants,
--    set context for each, run backfill.
-- ============================================================

BEGIN;

-- ── Step 1: Fix set_tenant_context to set BOTH settings ──────────────────

CREATE OR REPLACE FUNCTION set_tenant_context(p_tenant_id TEXT)
RETURNS VOID AS $$
BEGIN
  -- Set the setting used by newer migrations (017+, 019+, 020+, 050+)
  PERFORM set_config('app.current_tenant_id', p_tenant_id, true);
  -- Set the setting used by original migration 001 RLS policies
  -- (ki_transactions, ki_holdings, ki_clients, ki_portfolios, ki_goals,
  --  ki_goal_projections, ki_alerts, ki_nav_bookmarks)
  PERFORM set_config('app.tenant_id', p_tenant_id, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION set_tenant_context(TEXT) IS
  'Sets BOTH app.current_tenant_id (newer tables) and app.tenant_id (migration 001 tables) '
  'for RLS enforcement. Called by pool.ts on every connection checkout.';

-- ── Step 2: Re-run asset assignment backfill with proper tenant context ───
--
-- Loops over every tenant, sets context (so RLS passes on ki_transactions
-- and ki_holdings), then inserts missing ki_customer_asset_assignments rows.
-- ON CONFLICT DO NOTHING makes this safe to re-run.

DO $$
DECLARE
    v_tenant     RECORD;
    v_count      INTEGER := 0;
    v_total      INTEGER := 0;
BEGIN
    RAISE NOTICE '[053] Starting per-tenant asset assignment backfill...';

    FOR v_tenant IN SELECT id FROM vn_tenants ORDER BY created_at LOOP

        -- Set tenant context so RLS on ki_transactions and ki_holdings passes
        PERFORM set_tenant_context(v_tenant.id::TEXT);

        -- Insert missing MF assignments for this tenant (both is_live values)
        WITH earliest_txn AS (
            SELECT
                t.tenant_id,
                t.is_live,
                t.client_id,
                t.scheme_code,
                MIN(t.txn_date) AS first_txn_date
            FROM ki_transactions t
            WHERE t.scheme_code IS NOT NULL
            GROUP BY t.tenant_id, t.is_live, t.client_id, t.scheme_code
        ),
        backfill AS (
            SELECT
                e.tenant_id,
                e.is_live,
                e.client_id,
                mf.id                                               AS asset_type_id,
                e.scheme_code,
                CASE WHEN h.is_sip THEN 'sip'
                     ELSE 'one_time'
                END                                                 AS investment_type,
                e.first_txn_date                                    AS start_date,
                h.sip_amount                                        AS recurring_amount,
                CASE WHEN h.is_sip THEN 'monthly' ELSE NULL END    AS investment_frequency,
                true                                                AS is_active,
                NOW()                                               AS created_at,
                NOW()                                               AS updated_at
            FROM earliest_txn e
            JOIN ki_holdings h
                ON  h.tenant_id   = e.tenant_id
                AND h.client_id   = e.client_id
                AND h.scheme_code = e.scheme_code
                AND h.units       > 0
            JOIN ki_asset_types mf
                ON  mf.asset_type_code = 'MF'
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

        GET DIAGNOSTICS v_count = ROW_COUNT;

        IF v_count > 0 THEN
            RAISE NOTICE '[053]   Tenant %: inserted % asset assignment(s)', v_tenant.id, v_count;
        END IF;

        v_total := v_total + v_count;

    END LOOP;

    RAISE NOTICE '[053] Backfill complete — % total rows inserted across all tenants', v_total;
END $$;

COMMIT;

DO $$
DECLARE
    v_total INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_total FROM ki_customer_asset_assignments;
    RAISE NOTICE '[053] ki_customer_asset_assignments now has % rows', v_total;
    RAISE NOTICE '[053] set_tenant_context() now sets both app.current_tenant_id AND app.tenant_id';
END $$;
