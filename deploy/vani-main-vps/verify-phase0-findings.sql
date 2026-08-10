-- ============================================================================
-- Phase 0 — verify the findings against PRODUCTION
--
-- READ ONLY. No writes, no DDL, no locks beyond a shared read. Safe to run on
-- the live database while the funnel is taking traffic.
--
--   psql -d vani_gtm_db -f verify-phase0.sql
--
-- Every finding in docs/db/*.md was derived from a schema rebuilt locally from
-- the migration files. Production is known NOT to match that rebuild. This
-- script reports what production ACTUALLY says, so the docs can be corrected
-- before anything acts on them.
--
-- Paste the whole output back.
-- ============================================================================

\pset pager off
\timing off

\echo ''
\echo '=== 0. Which database am I even looking at? ============================'
SELECT current_database() AS db, current_user AS connected_as, version() AS pg;

\echo ''
\echo '=== 1. CLAIM: vikuna_admin is SUPERUSER, and does NOT hold BYPASSRLS ==='
\echo '    This is the whole premise of Item 3. If it is wrong, the RLS plan'
\echo '    needs revisiting. Expect rolsuper = t, rolbypassrls = f.'
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
FROM pg_roles
WHERE rolcanlogin
ORDER BY rolsuper DESC, rolname;

\echo ''
\echo '=== 2. CLAIM: production has far fewer ki_* tables than the migrations ='
\echo '    Local rebuild has 42. The old snapshot suggested ~9-12.'
\echo '    THIS NUMBER GATES THE ki_* RENAME — nothing runs until it is known.'
SELECT count(*) FILTER (WHERE table_name LIKE 'ki\_%')  AS ki_tables,
       count(*) FILTER (WHERE table_name LIKE 'gt\_%')  AS gt_tables,
       count(*) FILTER (WHERE table_name LIKE 'vn\_%')  AS vn_tables,
       count(*)                                         AS total_tables
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

\echo ''
\echo '    ...and exactly which ki_* tables exist, with their row counts.'
\echo '    THIS IS THE ONE RESULT ITEM 2 CANNOT PROCEED WITHOUT.'
\echo '    (reltuples is the planner estimate — instant, no table scan. -1'
\echo '     means never analyzed. Exact counts are not needed to decide.)'
SELECT c.relname                            AS ki_table,
       c.reltuples::bigint                  AS est_rows,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS size
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ki\_%'
ORDER BY c.reltuples DESC, c.relname;

\echo ''
\echo '=== 3. CLAIM: 68 policies carry an unguarded ::uuid cast ================'
\echo '    This is the bug migration 234 fixes — the one that breaks a pooled'
\echo '    connection the moment RLS is enforced. guarded should be 0 until 234'
\echo '    is applied; unguarded is how many would break.'
SELECT count(*) FILTER (WHERE qual LIKE '%::uuid%' AND qual NOT LIKE '%NULLIF%') AS unguarded_cast,
       count(*) FILTER (WHERE qual LIKE '%NULLIF%')                              AS already_guarded,
       count(*) FILTER (WHERE qual LIKE '%app.current_tenant_id%')               AS uses_current_tenant_id,
       count(*) FILTER (WHERE qual LIKE '%app.tenant_id%'
                          AND qual NOT LIKE '%current_tenant_id%')               AS uses_legacy_tenant_id,
       count(*)                                                                  AS policies_total
FROM pg_policies WHERE schemaname = 'public';

\echo ''
\echo '=== 4. CLAIM: platform rows (tenant_id IS NULL) exist and would vanish =='
\echo '    Migration 235. If platform_rows > 0 here, those rows disappear the'
\echo '    moment RLS is enforced without 235.'
SELECT 'gt_tags' AS tbl,
       count(*) FILTER (WHERE tenant_id IS NULL) AS platform_rows,
       count(*)                                  AS total_rows
FROM gt_tags
UNION ALL
SELECT 'gt_content_kinds',
       count(*) FILTER (WHERE tenant_id IS NULL), count(*)
FROM gt_content_kinds;

\echo ''
\echo '=== 5. CLAIM: vn_refresh_tokens grows without bound ====================='
\echo '    vn_cleanup_expired_sessions() has no caller and no scheduler entry.'
\echo '    If expired_still_active is large, that is a live operational cost.'
SELECT count(*)                                                        AS total,
       count(*) FILTER (WHERE is_active)                               AS active,
       count(*) FILTER (WHERE is_active AND expires_at < now())        AS expired_still_active,
       min(created_at)::date                                           AS oldest_row
FROM vn_refresh_tokens;

\echo ''
\echo '=== 6. CLAIM: 29 triggers / 29 project functions / 9 generated columns =='
SELECT (SELECT count(*) FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal AND n.nspname = 'public')            AS triggers,
       (SELECT count(*) FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public'
           AND p.proname NOT SIMILAR TO
   '(armor|dearmor|crypt|digest|decrypt%|encrypt%|gen_random%|gen_salt|hmac|pgp_%|uuid_%)')
                                                                        AS project_functions,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = 'public' AND is_generated = 'ALWAYS')     AS generated_columns,
       (SELECT count(*) FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity)
                                                                        AS rls_enabled_tables;

\echo ''
\echo '    ...and how many of those triggers do anything other than stamp'
\echo '    updated_at (the claim is: exactly one, ki_set_session_limit):'
SELECT p.proname AS trigger_function, count(*) AS attached_triggers
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_proc  p ON p.oid = t.tgfoid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname = 'public'
GROUP BY p.proname ORDER BY 2 DESC, 1;

\echo ''
\echo '=== 7. CLAIM: functions left dangling by migration 180 =================='
\echo '    DROP TABLE CASCADE does not parse plpgsql bodies. Any row here is a'
\echo '    function that would raise "relation does not exist" if called.'
WITH dropped(t) AS (VALUES
  ('ki_alerts'),('ki_goal_projections'),('ki_market_data'),('ki_market_indices'),
  ('ki_market_jobs'),('ki_nav_history'),('ki_portfolios'),('ki_scheme_aliases'),
  ('ki_scheme_bookmarks'),('ki_scheme_categories'))
SELECT p.proname, string_agg(d.t, ', ' ORDER BY d.t) AS references_dropped_table
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN dropped d ON lower(p.prosrc) LIKE '%' || d.t || '%'
WHERE n.nspname = 'public'
  AND NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = d.t)
GROUP BY p.proname ORDER BY 1;
\echo '    NOTE: set_tenant_context appears here as a false positive — it names'
\echo '    those tables only in a COMMENT listing which policies use which GUC.'
\echo '    It is live and correct. Every OTHER row is genuinely dangling.'

\echo ''
\echo '=== 8. CLAIM: ki_contacts.normalized_name destroys lowercase input ======'
\echo '    Only relevant if ki_contacts exists here. gt_ must give KAMAL CHARAN;'
\echo '    the ki_ variant gives K C because it strips before uppercasing.'
SELECT 'gt_contacts (correct)' AS which,
       upper(btrim(regexp_replace(regexp_replace(regexp_replace(
         'Kamal Charan','^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+','','i'),
         '[^A-Za-z0-9\s]','','g'),'\s+',' ','g'))) AS result
UNION ALL
SELECT 'ki_ variant (buggy)',
       upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
         'Kamal Charan','^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+','','i'),
         '[^A-Z0-9\s]','','g'),'\s+',' ','g'),'^\s+|\s+$','','g'));

\echo ''
\echo '=== 9. Migration history — how far ahead/behind is production? =========='
SELECT count(*) AS migrations_recorded,
       max(filename) AS latest
FROM vn_migrations;

\echo ''
\echo '=== Done. Paste all of the above back. ================================='
\echo ''
