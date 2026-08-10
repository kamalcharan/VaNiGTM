-- ============================================================================
-- Post-deploy check for migrations 235, 236, 237 and realign-vani-sequences.sql
--
-- READ ONLY. One plain SELECT — paste into any client and run.
-- Every row should read OK. Anything else is a deployment that did not land.
-- ============================================================================
SELECT * FROM (

  SELECT 1 AS n, '235 platform-row policies' AS check,
         CASE WHEN count(*) FILTER (WHERE cmd = 'SELECT') >= 2
                   AND count(*) FILTER (WHERE cmd = 'ALL') >= 2
              THEN 'OK — split into SELECT + ALL on both tables'
              ELSE 'NOT APPLIED — expected 2 SELECT + 2 ALL policies, found '
                   || count(*) FILTER (WHERE cmd = 'SELECT') || ' + '
                   || count(*) FILTER (WHERE cmd = 'ALL') END AS finding
    FROM pg_policies
   WHERE schemaname = 'public' AND tablename IN ('gt_tags','gt_content_kinds')

  UNION ALL SELECT 2, '236 ownership bypass closed',
    (SELECT CASE WHEN count(*) = 0 THEN 'OK — no app-owned table escapes its policy'
                 WHEN count(*) = 1 AND max(c.relname) = 'gt_agent_runs'
                      THEN 'OK — only gt_agent_runs remains, as intended '
                           || '(needs agent-core on withTenantClient first)'
                 ELSE 'INCOMPLETE — still bypassing: '
                      || string_agg(c.relname, ', ' ORDER BY c.relname) END
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND pg_get_userbyid(c.relowner) <> 'vikuna_admin')

  UNION ALL SELECT 3, 'sequence counters vs issued ids',
    coalesce((SELECT string_agg(
         t.slug || '/' || s.sequence_type || ' ' || s.prefix || '-' || s.last_value
         || CASE WHEN s.last_value < issued THEN '  <-- BEHIND, next id would collide'
                 ELSE '  ok' END, '   |   ' ORDER BY t.slug, s.sequence_type)
       FROM gt_seq_counters s
       JOIN vn_tenants t ON t.id = s.tenant_id
       CROSS JOIN LATERAL (
         SELECT coalesce(max(substring(l.lead_no from '([0-9]+)$')::int), 0)
           FROM gt_lead l
          WHERE l.tenant_id = s.tenant_id
            AND s.sequence_type = 'vani_lead'
            AND l.lead_no ~ ('^' || s.prefix || '-[0-9]+$')) AS x(issued)
      WHERE s.sequence_type LIKE 'vani%'), 'no vani counters found')

  UNION ALL SELECT 4, '237 public deck lookup',
    (SELECT CASE WHEN count(*) = 0
                 THEN 'NOT APPLIED — get_shared_deck() does not exist; '
                      || 'GET /share/:token will 404 for every deck after the cutover'
                 WHEN bool_and(p.prosecdef)
                 THEN 'OK — get_shared_deck() present and SECURITY DEFINER'
                 ELSE 'WRONG — get_shared_deck() exists but is NOT SECURITY DEFINER, '
                      || 'so it will not see past RLS' END
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_shared_deck')

  UNION ALL SELECT 5, '237 gt_agent_runs exemption is explicit',
    (SELECT CASE WHEN c.relrowsecurity
                 THEN 'NOT APPLIED — RLS still enabled; the worker will stop '
                      || 'recording runs once the app role is not the owner'
                 ELSE 'OK — RLS disabled, exemption visible rather than hidden '
                      || 'behind table ownership' END
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = 'gt_agent_runs')

  UNION ALL SELECT 6, 'ready for cutover?',
    (SELECT CASE WHEN count(*) = 0
                 THEN 'YES on the schema side — no table lets its owner escape '
                      || 'its own policy. Remaining work is operational: '
                      || 'grant-vanigtm-app.sql, switch DB_PRIMARY, re-run the '
                      || 'isolation test.'
                 ELSE 'NO — ' || count(*) || ' table(s) still bypass: '
                      || string_agg(c.relname, ', ' ORDER BY c.relname) END
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
        AND c.relrowsecurity AND NOT c.relforcerowsecurity
        AND pg_get_userbyid(c.relowner) <> 'vikuna_admin')

  UNION ALL SELECT 7, 'no duplicate lead_no',
    (SELECT CASE WHEN count(*) = 0 THEN 'OK — every lead_no is unique per tenant'
                 ELSE 'DUPLICATES: ' || string_agg(lead_no, ', ') END
       FROM (SELECT lead_no FROM gt_lead
              WHERE lead_no IS NOT NULL
              GROUP BY tenant_id, lead_no HAVING count(*) > 1) z)

) q ORDER BY q.n;
