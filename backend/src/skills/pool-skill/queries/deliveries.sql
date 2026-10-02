-- pool-skill.deliveries — the common pool's deliveries, newest first, each with
-- its rows counted by state across the three layers: staging (as delivered),
-- source rows (matched or not) and the companies they resolved to.
SELECT l.id, l.label, l.region, l.as_of, l.status, l.loaded_at, l.load_kind,
       ds.code AS source_code, ds.name AS source_name,
       (SELECT count(*) FROM ki_import_staging st JOIN ki_import_sessions se ON se.id = st.session_id
         WHERE se.load_id = l.id)                                                        AS staged,
       (SELECT count(*) FROM ki_import_staging st JOIN ki_import_sessions se ON se.id = st.session_id
         WHERE se.load_id = l.id AND st.processing_status = 'junk')                      AS staged_junk,
       (SELECT count(*) FROM ki_import_staging st JOIN ki_import_sessions se ON se.id = st.session_id
         WHERE se.load_id = l.id AND st.processing_status = 'held')                      AS staged_held,
       count(s.id)                                                                       AS source_rows,
       count(s.id) FILTER (WHERE s.company_id IS NULL)                                   AS unmatched,
       count(DISTINCT s.company_id) FILTER (WHERE c.lifecycle_state = 'complete')         AS complete,
       count(DISTINCT s.company_id) FILTER (WHERE c.lifecycle_state IN ('candidate','enriching')) AS waiting,
       count(DISTINCT s.company_id) FILTER (WHERE c.lifecycle_state = 'held')             AS held,
       count(DISTINCT s.company_id) FILTER (WHERE c.lifecycle_state = 'junk')             AS junk,
       count(DISTINCT s.company_id) FILTER (WHERE c.needs_review AND c.duplicate_of_id IS NOT NULL) AS duplicates
  FROM gt_source_loads l
  JOIN gt_data_sources ds ON ds.id = l.source_id
  LEFT JOIN gt_universe_company_sources s ON s.load_id = l.id
  LEFT JOIN gt_universe_companies c ON c.id = s.company_id
 WHERE l.tenant_id IS NULL
   AND ($source_code::text IS NULL OR ds.code = $source_code::text)
 GROUP BY l.id, ds.code, ds.name
 ORDER BY l.loaded_at DESC
 LIMIT 200;
