-- ============================================================================
-- Migration 248: vani_current_tenant() must BRIDGE, not compare raw ids
--
-- Found the way these are supposed to be found: by forcing RLS on one table
-- and watching a real save fail.
--
--   new row violates row-level security policy for table "vani_llm_provider"
--
-- ── THE MISMATCH ───────────────────────────────────────────────────────────
--
-- There are TWO tenant ids and they are different UUIDs:
--
--   vn_tenants.id    the auth framework's tenant. This is what the JWT
--                    carries and what set_tenant_context() puts in the GUC.
--   vani_tenant.id   the platform spine's tenant. This is what every
--                    vani_*/vara_* row stores in tenant_id.
--
-- They are joined by `slug`, never equal. Every bridge in the codebase does
-- that join — onboarding.routes.resolveVaniTenant, vara.routes.vaniTenantFor,
-- llm-provider.service.vaniTenantId.
--
-- But migration 240's policies are `tenant_id = vani_current_tenant()`, and
-- vani_current_tenant() returned the GUC verbatim — a vn_tenants id. So every
-- policy on the spine compares a vani_tenant.id against a vn_tenants.id and
-- can never match. Reads return nothing; writes are refused.
--
-- ── WHY NOBODY HIT IT UNTIL NOW ────────────────────────────────────────────
--
-- None of those tables had FORCE ROW LEVEL SECURITY, and they are owned by
-- the role the app connects as, so the owner bypassed its own policies and
-- the comparison was never evaluated. Migration 247 forced exactly one table,
-- which is what made the latent mismatch a hard error — on the one table that
-- had no existing data to lose. That is the good outcome: the defect surfaced
-- on the newest, emptiest table rather than on gt_ data in production.
--
-- ⚠️ This means the whole spine's isolation is UNENFORCED, not merely
-- unforced. Forcing those tables without this fix would take Vara down
-- instantly. See docs/db/rls-status.md §11.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- vani_current_tenant() does the same slug join every caller does. One
-- function, so all 20+ policies become correct at once rather than each
-- growing its own subquery.
--
-- SECURITY DEFINER because the lookup reads vani_tenant, which itself has a
-- policy calling this function — as an ordinary function that is infinite
-- recursion, or silently empty. Running as the owner (a superuser) reads both
-- tables directly and terminates. search_path is pinned, which SECURITY
-- DEFINER requires: without it a caller could shadow `vani_tenant` with a
-- temp table and choose their own tenant.
--
-- It accepts EITHER id. A GUC already holding a vani_tenant.id resolves to
-- itself, so any future path that sets it that way keeps working. Neither
-- matching returns NULL, which matches no row — absence denies, as before.
--
-- Idempotent: CREATE OR REPLACE.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION vani_current_tenant() RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH guc AS (
    SELECT nullif(
             coalesce(
               nullif(current_setting('app.current_tenant_id', true), ''),
               nullif(current_setting('app.tenant_id',         true), '')
             ), ''
           )::uuid AS id
  )
  SELECT COALESCE(
    -- The normal path: a vn_tenants id from the JWT, bridged by slug.
    (SELECT vt.id
       FROM vani_tenant vt
       JOIN vn_tenants  t ON t.slug = vt.slug
      WHERE t.id = (SELECT id FROM guc)),
    -- Already a vani_tenant id. Resolves to itself.
    (SELECT vt.id FROM vani_tenant vt WHERE vt.id = (SELECT id FROM guc))
  )
$$;

COMMENT ON FUNCTION vani_current_tenant() IS
  'Tenant for RLS on the vani_/vara_ spine, as a vani_tenant.id. Bridges from '
  'the vn_tenants id that set_tenant_context puts in the GUC, by slug — the '
  'two ids are different UUIDs and comparing them directly matches nothing '
  '(migration 248). Accepts either id. SECURITY DEFINER so the lookup is not '
  'blocked by vani_tenant''s own policy, which calls this function.';

COMMIT;

-- ============================================================================
-- Verify — as the APP role, not postgres:
--
--   BEGIN;
--     SELECT set_tenant_context('<a vn_tenants.id>');
--     SELECT vani_current_tenant();      -- the matching vani_tenant.id
--   COMMIT;
--
-- Then a real write against vani_llm_provider should succeed, and the same
-- write for another tenant's id should still be refused.
--
-- ROLLBACK: restore migration 247's body (the raw GUC read). That re-breaks
-- every forced policy on the spine, so only do it to un-block a deploy, and
-- expect vani_llm_provider writes to fail again.
-- ============================================================================
