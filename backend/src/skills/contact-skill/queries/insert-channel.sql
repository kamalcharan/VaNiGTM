INSERT INTO ki_contact_channels
  (contact_id, tenant_id, is_live, channel_type, channel_value, channel_subtype, is_primary)
VALUES
  ($contact_id, $tenant_id, $is_live, $channel_type, $channel_value, $channel_subtype, $is_primary)
ON CONFLICT (contact_id, channel_type, channel_value, is_live) DO NOTHING
RETURNING id, channel_type, channel_value, channel_subtype, is_primary
