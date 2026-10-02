SELECT c.*, c.id::text AS id, c.duplicate_of_id::text AS duplicate_of_id,
       d.name AS duplicate_of_name, i.name AS industry_name
  FROM gt_universe_companies c
  LEFT JOIN gt_universe_companies d ON d.id = c.duplicate_of_id
  LEFT JOIN gt_industries i ON i.id = c.industry_id
 WHERE c.id = $company_id::bigint AND c.merged_into_id IS NULL;
