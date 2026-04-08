INSERT INTO ki_client_bookmarks
  (client_id, tenant_id, is_live, user_id, reason_id, custom_reason, notes)
VALUES ($client_id, $tenant_id, $is_live, $user_id, $reason_id, $custom_reason, $notes)
ON CONFLICT (tenant_id, is_live, client_id, user_id) DO UPDATE SET
  reason_id     = COALESCE(EXCLUDED.reason_id,     ki_client_bookmarks.reason_id),
  custom_reason = COALESCE(EXCLUDED.custom_reason, ki_client_bookmarks.custom_reason),
  notes         = COALESCE(EXCLUDED.notes,         ki_client_bookmarks.notes),
  is_active     = true,
  updated_at    = now()
RETURNING id, client_id, reason_id, custom_reason, notes
