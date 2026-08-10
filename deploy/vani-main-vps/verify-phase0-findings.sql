-- ============================================================================
-- Phase 0 — verify the findings against PRODUCTION
--
-- READ ONLY. No writes, no DDL, no table scans. Safe to run on the live
-- database while the assessment funnel is taking traffic.
--
-- Runs ANYWHERE: pgAdmin, DBeaver, TablePlus, psql, any query tool. It is one
-- plain SELECT with no psql backslash meta-commands, so just paste and run.
-- Returns two columns — the check, and what production actually says.
--
--   psql:  psql -d vani_gtm_db -f verify-phase0-findings.sql
--   GUI:   paste the whole file, execute, copy the result grid back
--
-- WHY THIS EXISTS
-- Every finding in docs/db/*.md came from a schema rebuilt locally from the
-- migration files, and production is known NOT to match that rebuild. This
-- reports what production actually holds, so the docs can be corrected before
-- anything acts on them. Checks 2 and 3 are the two that gate real work.
--
-- Row counts use reltuples (the planner's estimate, already stored) rather
-- than count(*), so nothing scans a live table. Order of magnitude is all the
-- decisions need. "-1" means the table has never been analyzed.
--
-- Tables that do not exist here report "absent" rather than aborting the run —
-- which matters, because whether they exist is part of what is being checked.
-- ============================================================================

WITH
-- Safe row count for a table that may not exist in this database.
-- query_to_xml takes the query as TEXT, so it is only parsed at runtime, and
-- the CASE short-circuits before that happens when the table is missing.
safe AS (
  SELECT
    (SELECT CASE WHEN to_regclass('public.gt_tags') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.gt_tags', false, true, '')))[1]::text END) AS tags_total,
    (SELECT CASE WHEN to_regclass('public.gt_tags') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.gt_tags WHERE tenant_id IS NULL', false, true, '')))[1]::text END) AS tags_platform,
    (SELECT CASE WHEN to_regclass('public.gt_content_kinds') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.gt_content_kinds', false, true, '')))[1]::text END) AS kinds_total,
    (SELECT CASE WHEN to_regclass('public.gt_content_kinds') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.gt_content_kinds WHERE tenant_id IS NULL', false, true, '')))[1]::text END) AS kinds_platform,
    (SELECT CASE WHEN to_regclass('public.vn_refresh_tokens') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.vn_refresh_tokens', false, true, '')))[1]::text END) AS rt_total,
    (SELECT CASE WHEN to_regclass('public.vn_refresh_tokens') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.vn_refresh_tokens WHERE is_active AND expires_at < now()',
        false, true, '')))[1]::text END) AS rt_expired_active,
    (SELECT CASE WHEN to_regclass('public.vn_migrations') IS NULL THEN NULL ELSE
      (xpath('/row/c/text()', query_to_xml(
        'SELECT count(*) AS c FROM public.vn_migrations', false, true, '')))[1]::text END) AS migrations
),
dropped(t) AS (VALUES
  ('ki_alerts'),('ki_goal_projections'),('ki_market_data'),('ki_market_indices'),
  ('ki_market_jobs'),('ki_nav_history'),('ki_portfolios'),('ki_scheme_aliases'),
  ('ki_scheme_bookmarks'),('ki_scheme_categories'))

SELECT * FROM (

  SELECT 0 AS n, '0. database / user' AS check,
         current_database() || '  as  ' || current_user AS finding

  UNION ALL SELECT 1, '1. CLAIM: vikuna_admin is SUPERUSER, NOT bypassrls',
    coalesce((SELECT string_agg(rolname || ' [super=' || rolsuper || ' bypassrls=' || rolbypassrls || ']', ',  '
                                ORDER BY rolsuper DESC, rolname)
                FROM pg_roles WHERE rolcanlogin), 'none')
  UNION ALL SELECT 2, '   -> why it matters',
    'A replacement role must be NOSUPERUSER *and* NOBYPASSRLS. If this shows super=t, the whole Item 3 premise holds.'

  UNION ALL SELECT 3, '2. CLAIM: production has far fewer ki_* tables than the migrations',
    (SELECT 'ki=' || count(*) FILTER (WHERE relname LIKE 'ki\_%')
         || '  gt=' || count(*) FILTER (WHERE relname LIKE 'gt\_%')
         || '  vn=' || count(*) FILTER (WHERE relname LIKE 'vn\_%')
         || '  total=' || count(*) || '     (local rebuild: ki=42 gt=58 vn=14 total=114)'
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')
  UNION ALL SELECT 4, '   -> THE ki_* LIST — Item 2 cannot proceed without this',
    coalesce((SELECT string_agg(c.relname || '(' || c.reltuples::bigint || ')', ', ' ORDER BY c.relname)
                FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'ki\_%'),
             'no ki_* tables at all')
  UNION ALL SELECT 5, '   -> reading it',
    'name(est_rows). -1 = never analyzed. Migration 233 ships as a no-op until this list is known.'

  UNION ALL SELECT 6, '3. CLAIM: 68 policies carry an unguarded ::uuid cast',
    (SELECT 'unguarded=' || count(*) FILTER (WHERE qual LIKE '%::uuid%' AND qual NOT LIKE '%NULLIF%')
         || '  guarded=' || count(*) FILTER (WHERE qual LIKE '%NULLIF%')
         || '  total=' || count(*)
         || '     (local before 234: unguarded=68 guarded=0 total=77)'
       FROM pg_policies WHERE schemaname = 'public')
  UNION ALL SELECT 7, '   -> GUC split (set_tenant_context sets both names)',
    (SELECT 'app.current_tenant_id=' || count(*) FILTER (WHERE qual LIKE '%app.current_tenant_id%')
         || '  legacy app.tenant_id=' || count(*) FILTER (WHERE qual LIKE '%app.tenant_id%'
                                                            AND qual NOT LIKE '%current_tenant_id%')
       FROM pg_policies WHERE schemaname = 'public')

  UNION ALL SELECT 8, '4. CLAIM: platform rows (tenant_id IS NULL) vanish under RLS',
    (SELECT 'gt_tags: ' || coalesce(tags_platform, 'absent') || ' platform of ' || coalesce(tags_total, '-')
         || '   |   gt_content_kinds: ' || coalesce(kinds_platform, 'absent') || ' platform of ' || coalesce(kinds_total, '-')
       FROM safe)
  UNION ALL SELECT 9, '   -> reading it',
    'Any platform count > 0 is a row that silently disappears once RLS is on, unless migration 235 is applied.'

  UNION ALL SELECT 10, '5. CLAIM: vn_refresh_tokens grows without bound',
    (SELECT 'total=' || coalesce(rt_total, 'absent') || '  expired-but-still-active=' || coalesce(rt_expired_active, '-')
       FROM safe)
  UNION ALL SELECT 11, '   -> reading it',
    'vn_cleanup_expired_sessions() has no caller and no scheduler entry. A large second number is a live cost.'

  UNION ALL SELECT 12, '6. CLAIM: 29 triggers / 29 project functions / 9 generated cols / 76 RLS tables',
    (SELECT 'triggers=' || (SELECT count(*) FROM pg_trigger t
                              JOIN pg_class c ON c.oid = t.tgrelid
                              JOIN pg_namespace n ON n.oid = c.relnamespace
                             WHERE NOT t.tgisinternal AND n.nspname = 'public')
         || '  project_functions=' || (SELECT count(*) FROM pg_proc p
                              JOIN pg_namespace n ON n.oid = p.pronamespace
                             WHERE n.nspname = 'public' AND p.proname NOT SIMILAR TO
      '(armor|dearmor|crypt|digest|decrypt%|encrypt%|gen_random%|gen_salt|hmac|pgp_%|uuid_%)')
         || '  generated_cols=' || (SELECT count(*) FROM information_schema.columns
                             WHERE table_schema = 'public' AND is_generated = 'ALWAYS')
         || '  rls_tables=' || (SELECT count(*) FROM pg_class c
                              JOIN pg_namespace n ON n.oid = c.relnamespace
                             WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity))
  UNION ALL SELECT 13, '   -> trigger functions, by how many triggers use each',
    coalesce((SELECT string_agg(x.proname || '(' || x.ct || ')', ', ' ORDER BY x.ct DESC, x.proname)
                FROM (SELECT p.proname, count(*) AS ct
                        FROM pg_trigger t
                        JOIN pg_class c ON c.oid = t.tgrelid
                        JOIN pg_proc  p ON p.oid = t.tgfoid
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                       WHERE NOT t.tgisinternal AND n.nspname = 'public'
                       GROUP BY p.proname) x), 'none')
  UNION ALL SELECT 14, '   -> reading it',
    'Claim: every one of those is an updated_at stamp except ki_set_session_limit.'

  UNION ALL SELECT 15, '7. CLAIM: migration 180 left functions pointing at dropped tables',
    coalesce((SELECT string_agg(DISTINCT p.proname, ', ' ORDER BY p.proname)
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                JOIN dropped d ON lower(p.prosrc) LIKE '%' || d.t || '%'
               WHERE n.nspname = 'public'
                 AND to_regclass('public.' || d.t) IS NULL), 'none — nothing dangling')
  UNION ALL SELECT 16, '   -> known false positive',
    'set_tenant_context appears only because it names those tables in a COMMENT. It is live and correct. Every other name is genuinely dangling.'

  UNION ALL SELECT 17, '8. CLAIM: the ki_ name normaliser destroys lowercase input',
    'gt_ form -> ' ||
      upper(btrim(regexp_replace(regexp_replace(regexp_replace(
        'Kamal Charan', '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
        '[^A-Za-z0-9\s]', '', 'g'), '\s+', ' ', 'g')))
    || '   |   ki_ form -> ' ||
      upper(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
        'Kamal Charan', '^(MR|MRS|MS|DR|PROF|SRI|SMT)\.?\s+', '', 'i'),
        '[^A-Z0-9\s]', '', 'g'), '\s+', ' ', 'g'), '^\s+|\s+$', '', 'g'))
  UNION ALL SELECT 18, '   -> reading it',
    'Expect KAMAL CHARAN then K C. The ki_ form strips before uppercasing. Only affects ki_contacts; VaNi uses the gt_ form.'

  UNION ALL SELECT 19, '9. Migration history',
    (SELECT coalesce('recorded=' || migrations, 'vn_migrations absent') FROM safe)
    || '     (local rebuild applied 125, latest 232_vani_tenant_portable.sql)'

) q ORDER BY q.n;
