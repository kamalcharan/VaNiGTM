-- get_channels: list all channels for tenant, optionally filtered by type
-- Named params: $tenant_id, $is_live, $channel_type (nullable)

SELECT
    id, channel_type, name, status, config,
    total_sent, total_replies, last_tested_at, created_at
FROM gt_channels
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true
  AND (
      $channel_type::text IS NULL
      OR channel_type = $channel_type::text
  )
ORDER BY channel_type ASC, name ASC;
