SELECT
  id,
  tenant_id,
  version,
  changed_by,
  change_note,
  created_at
FROM gt_tenant_profile_history
WHERE tenant_id = $tenant_id
ORDER BY version DESC
LIMIT 20;
