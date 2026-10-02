-- pool-skill.industries — the one industry master, with how many pool
-- companies sit under each node (complete = in the core pool).
SELECT i.id, i.code, i.name, i.parent_id, i.sort_order, i.nic_prefixes, i.source, i.is_active,
       count(c.id) FILTER (WHERE c.lifecycle_state = 'complete')  AS in_pool,
       count(c.id) FILTER (WHERE c.lifecycle_state <> 'junk')     AS companies
  FROM gt_industries i
  LEFT JOIN gt_universe_companies c ON c.industry_id = i.id AND c.merged_into_id IS NULL
 GROUP BY i.id
 ORDER BY i.parent_id NULLS FIRST, i.sort_order, i.name;
