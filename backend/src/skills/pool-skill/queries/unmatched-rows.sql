SELECT s.id::text AS source_row_id, s.name, s.city, s.state_code, s.domain_normalized, s.industry_raw, s.pin,
       count(*) OVER () AS filtered_total
  FROM gt_universe_company_sources s
 WHERE s.load_id = $load_id::bigint AND s.company_id IS NULL
 ORDER BY s.id
 LIMIT $limit::int OFFSET $offset::int;
