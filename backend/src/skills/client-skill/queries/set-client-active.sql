UPDATE ki_clients
SET    is_active  = $is_active,
       updated_at = NOW()
WHERE  id         = $client_id
  AND  tenant_id  = $tenant_id
  AND  is_live    = $is_live
  AND  is_active != $is_active
RETURNING id, is_active, updated_at
