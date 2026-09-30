-- ============================================================================
-- Migration 259: a tenant must be able to PROVISION its own vani_tenant row
--
-- PENDING APPROVAL (Charan). Written 2026-09-30 while preparing the switch of
-- DB_PRIMARY from vikuna_admin to vanigtm_app. Do not apply before that
-- decision; it is harmless under vikuna_admin (which bypasses RLS) but it is a
-- policy change on platform data and gets a yes first.
--
-- ── WHAT BREAKS WITHOUT IT ─────────────────────────────────────────────────
--
-- Found by running the API as vanigtm_app against a database built from the
-- migrations and walking a new tenant through onboarding:
--
--   [Onboarding:step] error: new row violates row-level security policy
--                     for table "vani_tenant"
--
-- The Domain step (onboarding.routes.resolveVaniTenant) is where a tenant's
-- vani_tenant row is created — lazily, on first touch, bridged from
-- vn_tenants by slug. vani_tenant's only policy is
--
--     tenant_isolation  FOR ALL  USING (id = vani_current_tenant())
--
-- and vani_current_tenant() (migration 248) finds the vani_tenant id BY
-- LOOKING UP THE vani_tenant ROW for the caller's slug. For a row that does not
-- exist yet it returns NULL, so the insert can never satisfy its own check.
-- Every NEW tenant is therefore stuck before the Domain step, which means no
-- Vara, no Install screen, no widget. Existing tenants are unaffected — their
-- row already exists, and that is why nothing in production has shown it.
-- Under vikuna_admin (superuser, BYPASSRLS) the policy is never evaluated.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- A second PERMISSIVE policy on vani_tenant that admits the row whose slug is
-- the caller's own vn_tenants slug. Permissive policies are OR'd, so the
-- existing policy is untouched and this only ADDS the one row a tenant is
-- entitled to: its own. It covers INSERT's WITH CHECK, the RETURNING read
-- (INSERT ... RETURNING must pass SELECT policies too, and vani_current_tenant()
-- is STABLE, so it cannot see the row the same statement inserts), and the
-- ON CONFLICT (slug) DO UPDATE path.
--
-- Why this is not a widening:
--   - The slug comes from vn_tenants for the id in the GUC, and the GUC comes
--     from the JWT via set_tenant_context — never from the request.
--   - vn_tenants.slug is unique, so it names exactly one tenant; a tenant can
--     reach only the vani_tenant row that shares its own slug, which is the
--     same row vani_current_tenant() already resolves to once it exists.
--   - It is the bridge every other reader already uses (resolveVaniTenant,
--     vaniTenantFor, llm-provider.service) — stated as a policy.
--
-- The helper is SECURITY DEFINER with a pinned search_path for the same
-- reason vani_current_tenant() is (248): a policy that reads another table
-- must not depend on that table's own policies or on the caller's path.
--
-- Idempotent: CREATE OR REPLACE the function; DROP POLICY IF EXISTS first.
-- ============================================================================

CREATE OR REPLACE FUNCTION vani_current_vn_slug()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.slug
    FROM vn_tenants t
   WHERE t.id = nullif(
                  coalesce(
                    nullif(current_setting('app.current_tenant_id', true), ''),
                    nullif(current_setting('app.tenant_id',         true), '')
                  ), ''
                )::uuid
$$;

COMMENT ON FUNCTION vani_current_vn_slug() IS
  'Slug of the vn_tenants row named by the tenant GUC. Lets vani_tenant admit its own row before vani_current_tenant() can resolve it (migration 259).';

REVOKE ALL ON FUNCTION vani_current_vn_slug() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT EXECUTE ON FUNCTION vani_current_vn_slug() TO vanigtm_app;
  END IF;
END
$$;

DROP POLICY IF EXISTS tenant_self_by_slug ON vani_tenant;
CREATE POLICY tenant_self_by_slug ON vani_tenant
  FOR ALL
  USING      (slug = vani_current_vn_slug())
  WITH CHECK (slug = vani_current_vn_slug());
