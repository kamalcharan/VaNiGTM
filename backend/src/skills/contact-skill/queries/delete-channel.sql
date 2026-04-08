UPDATE ki_contact_channels
SET is_active = false
WHERE id        = $channel_id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true
RETURNING id
