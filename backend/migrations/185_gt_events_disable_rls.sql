-- ============================================================================
-- Migration 185: Vikuna GTM — Disable RLS on gt_events (Phase 3 follow-up)
--
-- gt_events is the event bus. The background worker polls it across ALL
-- tenants (it has no tenant context — it discovers pending work for every
-- tenant, then dispatches per-tenant). The tenant-isolation RLS policy added
-- in migration 181 hides every row from any connection that has not set
-- `app.current_tenant_id`, so the worker's poll silently returned 0 rows.
--
-- Fix: drop the policy and disable RLS on gt_events. This is the correct
-- pattern for cross-tenant infrastructure tables (same rationale as gt_prompts,
-- which was never RLS-enabled in 181). Tenant safety is preserved because:
--   1. Application code ALWAYS filters by tenant_id on gt_events writes.
--   2. Reads are performed by the worker/system, which is intentionally
--      cross-tenant, or by app code that filters by tenant_id explicitly.
--   3. The app DB role (vanigtm_app) stays rolbypassrls=false — we disable RLS
--      per-table here rather than granting BYPASSRLS to the whole role, which
--      would defeat RLS on the genuinely tenant-scoped tables.
--
-- This codifies a manual `ALTER TABLE gt_events DISABLE ROW LEVEL SECURITY`
-- that was run by hand on the live VPS DB during Phase 3 verification, so
-- other environments get the same change. Idempotent.
-- ============================================================================

DROP POLICY IF EXISTS gt_events_tenant_isolation ON gt_events;

ALTER TABLE gt_events DISABLE ROW LEVEL SECURITY;

COMMENT ON TABLE gt_events IS
    'Event bus. Workers poll pending rows across ALL tenants. RLS intentionally '
    'DISABLED (migration 185) — cross-tenant by design. Application code filters '
    'by tenant_id on every write and on tenant-scoped reads.';
