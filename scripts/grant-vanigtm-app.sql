-- ============================================================================
-- grant-vanigtm-app.sql — least-privilege grants for the app runtime role
--
-- PURPOSE
--   Today the app/worker connects as `vikuna_admin` (rolsuper=true,
--   rolbypassrls=true), so RLS is BYPASSED at runtime and tenant isolation
--   rests solely on the app-layer `WHERE tenant_id = $1`. This script grants
--   the least-privilege role `vanigtm_app` (rolsuper=false, rolbypassrls=false)
--   everything it needs so DB_PRIMARY can be switched to it — at which point
--   RLS actually enforces.
--
-- WHAT THIS DOES
--   - Grants USAGE on schema public.
--   - Grants SELECT/INSERT/UPDATE/DELETE on all EXISTING tables to vanigtm_app.
--   - Grants USAGE/SELECT on all EXISTING sequences (SERIAL/BIGSERIAL nextval).
--   - Grants EXECUTE on all EXISTING functions (incl. set_tenant_context(text),
--     which is SECURITY DEFINER — vanigtm_app still needs EXECUTE to call it).
--   - Sets DEFAULT PRIVILEGES so FUTURE objects created by vikuna_admin (i.e.
--     future migrations) are auto-granted to vanigtm_app.
--
-- WHAT THIS DOES NOT DO
--   - Does NOT change DB_PRIMARY (that's the cutover step — see the checklist).
--   - Does NOT revoke anything from vikuna_admin (kept for migrations).
--   - Does NOT grant DDL (CREATE/ALTER/DROP/TRUNCATE) — the app must not own
--     or alter schema. Migrations continue to run as vikuna_admin.
--   - Does NOT grant BYPASSRLS or SUPERUSER — the whole point is that
--     vanigtm_app is subject to RLS.
--
-- HOW TO RUN (later, as a separate task AFTER Phase 4)
--   Run as the table OWNER (vikuna_admin) against vani_gtm_db:
--     psql "$DB_PRIMARY_ADMIN" -f scripts/grant-vanigtm-app.sql
--   (DB_PRIMARY_ADMIN = a connection string whose user is vikuna_admin.)
--
-- IDEMPOTENT: all GRANT / ALTER DEFAULT PRIVILEGES statements are safe to
-- re-run. gt_agent_runs is already owned by vanigtm_app; grants on it are
-- harmless no-ops.
-- ============================================================================

\set ON_ERROR_STOP on

-- ── Safety guard: must be run by a role that owns the objects ───────────────
DO $$
BEGIN
    IF current_user <> 'vikuna_admin' THEN
        RAISE EXCEPTION
            'Run this as vikuna_admin (owner of the tables), not %.', current_user;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
        RAISE EXCEPTION 'Role vanigtm_app does not exist — create it first.';
    END IF;
END
$$;

BEGIN;

-- ── 1. Schema usage ─────────────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO vanigtm_app;

-- ── 2. Existing tables — DML only (no DDL) ──────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA public
    TO vanigtm_app;

-- ── 3. Existing sequences — for SERIAL / BIGSERIAL nextval() ─────────────────
GRANT USAGE, SELECT
    ON ALL SEQUENCES IN SCHEMA public
    TO vanigtm_app;

-- ── 4. Existing functions — incl. set_tenant_context(text) [SECURITY DEFINER],
--       vn_set_updated_at(), and any RPC helpers the skills call ─────────────
GRANT EXECUTE
    ON ALL FUNCTIONS IN SCHEMA public
    TO vanigtm_app;

-- ── 5. FUTURE objects created by vikuna_admin (future migrations) ───────────
--    ALTER DEFAULT PRIVILEGES only affects objects created by the named role,
--    so this must name vikuna_admin (the role migrations run as).
ALTER DEFAULT PRIVILEGES FOR ROLE vikuna_admin IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vanigtm_app;

ALTER DEFAULT PRIVILEGES FOR ROLE vikuna_admin IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO vanigtm_app;

ALTER DEFAULT PRIVILEGES FOR ROLE vikuna_admin IN SCHEMA public
    GRANT EXECUTE ON FUNCTIONS TO vanigtm_app;

COMMIT;

-- ── Post-grant sanity (read-only; prints what vanigtm_app can now do) ────────
\echo 'Sample table privileges for vanigtm_app (expect SELECT/INSERT/UPDATE/DELETE):'
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privs
FROM information_schema.role_table_grants
WHERE grantee = 'vanigtm_app'
  AND table_schema = 'public'
  AND table_name IN ('gt_presentations','gt_kg_nodes','gt_tenant_profile',
                     'gt_agent_runs','vn_users','vn_tenants')
GROUP BY table_name
ORDER BY table_name;

\echo 'EXECUTE on set_tenant_context (expect one row):'
SELECT p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'set_tenant_context'
  AND has_function_privilege('vanigtm_app', p.oid, 'EXECUTE');
