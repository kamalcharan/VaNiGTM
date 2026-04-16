-- KI: Soft-delete an asset assignment (is_active = false)
-- MF assignments auto-created from imports are deletable if the advisor
-- wants to remove them from the Assets tab.
-- Named params: $assignment_id, $tenant_id, $is_live, $client_id

UPDATE ki_customer_asset_assignments
SET
    is_active  = false,
    updated_at = NOW()
WHERE id        = $assignment_id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live
  AND client_id = $client_id
  AND is_active = true
RETURNING id AS assignment_id;
