SELECT id
FROM ki_clients
WHERE id = $client_id
  AND tenant_id = $tenant_id
  AND is_live = $is_live
  AND is_active = true
