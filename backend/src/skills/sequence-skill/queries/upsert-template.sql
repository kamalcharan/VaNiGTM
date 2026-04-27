INSERT INTO gt_step_templates
  (step_id, tenant_id, is_live, variant_label, subject, body)
VALUES
  ($step_id, $tenant_id, $is_live, $variant_label, $subject, $body)
ON CONFLICT (step_id, variant_label, is_live) DO UPDATE SET
  subject    = EXCLUDED.subject,
  body       = EXCLUDED.body,
  updated_at = now()
RETURNING id, variant_label, subject, body, created_at, updated_at
