-- get_channel: single channel with full config
-- Named params: $tenant_id, $is_live, $channel_id

SELECT
    id, channel_type, name, status, config,
    total_sent, total_replies, last_tested_at, created_at, updated_at
FROM gt_channels
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true
  AND id        = $channel_id;
