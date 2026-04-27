-- get_agent_runs: paginated agent decision log
-- Named params: $tenant_id, $is_live, $agent_type (nullable), $status (nullable),
--               $campaign_id (nullable), $limit, $offset

SELECT
    r.id, r.agent_type, r.agent_name, r.action, r.status,
    r.duration_ms, r.inputs, r.outputs, r.error_message,
    r.started_at, r.completed_at,
    c.name AS campaign_name
FROM gt_agent_runs r
LEFT JOIN gt_campaigns c ON c.id = r.campaign_id
WHERE r.tenant_id = $tenant_id
  AND r.is_live   = $is_live
  AND ($agent_type::text IS NULL OR r.agent_type = $agent_type::text)
  AND ($status::text IS NULL OR r.status = $status::text)
  AND ($campaign_id::bigint IS NULL OR r.campaign_id = $campaign_id::bigint)
ORDER BY r.created_at DESC
LIMIT  $limit
OFFSET $offset;
