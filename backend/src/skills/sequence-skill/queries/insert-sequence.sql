INSERT INTO gt_sequences
  (campaign_id, tenant_id, is_live, name, description, created_by, sort_order)
VALUES
  ($campaign_id, $tenant_id, $is_live, $name, $description, $created_by,
   COALESCE(
     (SELECT MAX(sort_order) + 1 FROM gt_sequences
      WHERE campaign_id = $campaign_id AND is_live = $is_live AND is_active = true),
     0
   ))
RETURNING id, name, status, sort_order, created_at
