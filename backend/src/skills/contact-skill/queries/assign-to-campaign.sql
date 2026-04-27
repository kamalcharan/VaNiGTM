INSERT INTO gt_contact_assignments
  (contact_id, campaign_id, tenant_id, is_live, stage, score)
VALUES
  ($contact_id, $campaign_id, $tenant_id, $is_live, 'identified', 0)
ON CONFLICT (contact_id, campaign_id, is_live) DO NOTHING
RETURNING id, contact_id, campaign_id, stage, score, created_at
