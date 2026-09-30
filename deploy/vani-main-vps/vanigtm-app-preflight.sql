-- ============================================================================
-- vanigtm-app-preflight.sql — READ-ONLY. Can DB_PRIMARY switch to vanigtm_app?
--
-- Run BEFORE changing DB_PRIMARY, as vikuna_admin (the current runtime role),
-- from inside the API container — see DEPLOY.md §4 "switching the runtime role":
--
--   docker exec -i vani-backend node - < /dev/null   # (DEPLOY.md has the wrapper)
--
-- Every row should read OK. Anything else is a reason not to switch yet.
-- Writes nothing: SELECTs against the catalog only.
--
-- Why each check exists (2026-09-30, from running the API as vanigtm_app
-- against a database built from the migrations):
--   1  a role that is SUPERUSER or BYPASSRLS makes the whole exercise a no-op
--   2  a table the role cannot touch fails at runtime as "permission denied",
--      which the API reports as a 500 — tables added after the grant script
--      ran are the likely ones (255–257, the intent tables, are from Aug 29)
--   3  SERIAL/identity inserts need USAGE on the sequence
--   4  the RLS helpers must be EXECUTE-able, or every policy errors
--   5  future migrations must keep granting (ALTER DEFAULT PRIVILEGES)
--   6  migration 259 — without it no NEW tenant can finish the Domain step
--   7  owners: a table OWNED by vanigtm_app bypasses its own policies unless
--      FORCE ROW LEVEL SECURITY is set (the 236 lesson). Listed, not judged.
-- ============================================================================

WITH app AS (SELECT 'vanigtm_app'::name AS r),
tables AS (
  SELECT c.oid, c.relname, pg_get_userbyid(c.relowner) AS owner,
         c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
),
missing_tbl AS (
  SELECT relname FROM tables, app
   WHERE NOT (has_table_privilege(app.r, oid, 'SELECT')
          AND has_table_privilege(app.r, oid, 'INSERT')
          AND has_table_privilege(app.r, oid, 'UPDATE')
          AND has_table_privilege(app.r, oid, 'DELETE'))
),
missing_seq AS (
  SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, app
   WHERE n.nspname = 'public' AND c.relkind = 'S'
     AND NOT has_sequence_privilege(app.r, c.oid, 'USAGE')
),
helpers AS (
  SELECT f FROM unnest(ARRAY[
    'set_tenant_context(text)', 'vani_current_tenant()', 'vani_current_vn_slug()',
    'gt_next_seq(uuid,text)', 'vani_ensure_seq_prefixes(uuid)'
  ]) AS f
),
missing_fn AS (
  SELECT h.f FROM helpers h, app
   WHERE to_regprocedure(h.f) IS NULL
      OR NOT has_function_privilege(app.r, to_regprocedure(h.f), 'EXECUTE')
)
SELECT * FROM (
  SELECT 1 AS n, 'role vanigtm_app: login, not superuser, not bypassrls' AS check,
         CASE WHEN rolcanlogin AND NOT rolsuper AND NOT rolbypassrls THEN 'OK'
              ELSE format('BAD login=%s super=%s bypassrls=%s', rolcanlogin, rolsuper, rolbypassrls) END AS result
    FROM pg_roles WHERE rolname = 'vanigtm_app'
  UNION ALL
  SELECT 2, 'DML on every public table',
         COALESCE('MISSING on: ' || string_agg(relname, ', ' ORDER BY relname), 'OK')
    FROM missing_tbl
  UNION ALL
  SELECT 3, 'USAGE on every sequence',
         COALESCE('MISSING on: ' || string_agg(relname, ', ' ORDER BY relname), 'OK')
    FROM missing_seq
  UNION ALL
  SELECT 4, 'EXECUTE on the RLS helpers',
         COALESCE('MISSING or absent: ' || string_agg(f, ', '), 'OK')
    FROM missing_fn
  UNION ALL
  SELECT 5, 'default privileges: vikuna_admin -> vanigtm_app on new tables',
         CASE WHEN EXISTS (
           SELECT 1 FROM pg_default_acl d
            WHERE d.defaclrole = 'vikuna_admin'::regrole AND d.defaclobjtype = 'r'
              AND d.defaclacl::text LIKE '%vanigtm_app=%'
         ) THEN 'OK' ELSE 'MISSING — re-run scripts/grant-vanigtm-app.sql' END
  UNION ALL
  SELECT 6, 'migration 259 (vani_tenant self-provision policy) applied',
         CASE WHEN EXISTS (SELECT 1 FROM pg_policies
                            WHERE tablename = 'vani_tenant' AND policyname = 'tenant_self_by_slug')
              THEN 'OK' ELSE 'MISSING — new tenants cannot finish the Domain step' END
  UNION ALL
  SELECT 7, 'tables owned by vanigtm_app with RLS on but NOT forced (owner bypass)',
         COALESCE('REVIEW: ' || string_agg(relname, ', ' ORDER BY relname), 'OK (none)')
    FROM tables WHERE owner = 'vanigtm_app' AND rls AND NOT forced
  UNION ALL
  SELECT 8, 'owners of public tables (information)',
         string_agg(format('%s=%s', owner, cnt), ', ')
    FROM (SELECT owner, count(*) AS cnt FROM tables GROUP BY owner) o
) checks
ORDER BY n;
