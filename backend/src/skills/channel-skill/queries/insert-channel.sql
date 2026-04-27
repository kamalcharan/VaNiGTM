INSERT INTO gt_channels
  (tenant_id, is_live, channel_type, name, config, created_by)
VALUES
  ($tenant_id, $is_live, $channel_type, $name, $config::jsonb, $created_by)
RETURNING id, channel_type, name, status, created_at
