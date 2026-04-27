INSERT INTO gt_persona_signals
  (persona_id, tenant_id, is_live, signal_type, label, description, weight)
VALUES
  ($persona_id, $tenant_id, $is_live, $signal_type, $label, $description, $weight)
RETURNING id, signal_type, label, description, weight, created_at
