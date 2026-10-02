SELECT s.id::text AS id, ds.code AS source_code, ds.name AS source_name, COALESCE(l.tier_override, ds.tier) AS tier,
       l.id::text AS load_id, l.label AS load_label, l.status AS load_status,
       COALESCE(s.source_as_of, l.as_of) AS as_of, s.method, s.name, s.city, s.state_code, s.pin,
       s.domain_normalized, s.industry_raw, s.raw,
       l.load_kind, s.model, s.confidence, s.email, s.phone, s.linkedin_url, s.twitter_url, s.facebook_url,
       s.description, s.industry_id, s.is_individual, s.employees_band, s.domain_status
  FROM gt_universe_company_sources s
  JOIN gt_source_loads l ON l.id = s.load_id
  JOIN gt_data_sources ds ON ds.id = s.source_id
 WHERE s.company_id = $company_id::bigint
 ORDER BY COALESCE(l.tier_override, ds.tier) DESC, s.id;
