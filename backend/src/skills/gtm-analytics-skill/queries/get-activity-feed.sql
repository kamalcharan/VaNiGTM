-- get_activity_feed: recent events for war room live view
-- Named params: $tenant_id, $is_live, $event_type (nullable), $campaign_id (nullable), $limit

SELECT
    id, event_type, summary, detail, campaign_id, contact_id,
    sequence_id, agent_run_id, created_at
FROM gt_activity_feed
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND ($event_type::text IS NULL OR event_type = $event_type::text)
  AND ($campaign_id::bigint IS NULL OR campaign_id = $campaign_id::bigint)
ORDER BY created_at DESC
LIMIT $limit;
