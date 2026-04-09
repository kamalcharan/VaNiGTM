UPDATE ki_contact_channels
SET is_primary = false
WHERE contact_id   = $contact_id
  AND channel_type = $channel_type
  AND is_live      = $is_live
  AND is_active    = true
  AND is_primary   = true
