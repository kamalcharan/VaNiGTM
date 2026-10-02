-- pool-skill.sources — every data source with what it has delivered to the
-- common pool and how much of it reached the core pool (lifecycle complete).
-- Cross-tenant platform data; the function gates on ctx.is_admin.
SELECT ds.id, ds.code, ds.name, ds.kind, ds.tier, ds.licence_class, ds.may_enter_pool, ds.is_active,
       count(DISTINCT l.id) FILTER (WHERE l.status = 'active')                       AS deliveries,
       count(DISTINCT l.id) FILTER (WHERE l.status = 'retired')                      AS retired_deliveries,
       (SELECT count(*) FROM ki_import_staging st
          JOIN ki_import_sessions se ON se.id = st.session_id
          JOIN gt_source_loads sl ON sl.id = se.load_id
         WHERE sl.source_id = ds.id AND sl.tenant_id IS NULL AND sl.status = 'active') AS rows_staged,
       count(s.id) FILTER (WHERE l.status = 'active')                                AS source_rows,
       count(DISTINCT s.company_id) FILTER (WHERE l.status = 'active' AND c.lifecycle_state = 'complete') AS in_pool
  FROM gt_data_sources ds
  LEFT JOIN gt_source_loads l ON l.source_id = ds.id AND l.tenant_id IS NULL
  LEFT JOIN gt_universe_company_sources s ON s.load_id = l.id AND NOT (s.raw ? 'decision')
  LEFT JOIN gt_universe_companies c ON c.id = s.company_id
 GROUP BY ds.id
 ORDER BY ds.tier DESC, ds.code;
