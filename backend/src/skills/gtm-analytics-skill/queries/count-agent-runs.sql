-- count_agent_runs: total for pagination
-- Named params: $tenant_id, $is_live, $agent_type (nullable), $status (nullable), $campaign_id (nullable)

SELECT COUNT(*)::int AS total
FROM gt_agent_runs
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND ($agent_type::text IS NULL OR agent_type = $agent_type::text)
  AND ($status::text IS NULL OR status = $status::text)
  AND ($campaign_id::bigint IS NULL OR campaign_id = $campaign_id::bigint);
