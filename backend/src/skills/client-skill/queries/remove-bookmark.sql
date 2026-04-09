UPDATE ki_client_bookmarks
SET is_active  = false,
    updated_at = now()
WHERE client_id = $client_id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live
  AND user_id   = $user_id
  AND is_active = true
RETURNING id
