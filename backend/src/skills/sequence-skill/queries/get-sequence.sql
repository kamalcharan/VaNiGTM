-- get_sequence: single sequence with all steps + templates
-- Named params: $tenant_id, $is_live, $sequence_id
-- Returns: sequence row + steps with nested templates (assembled in code)

SELECT
    s.id, s.name, s.description, s.status, s.campaign_id,
    s.contacts_count, s.avg_open_rate, s.avg_reply_rate,
    s.created_at, s.updated_at
FROM gt_sequences s
WHERE s.tenant_id = $tenant_id
  AND s.is_live   = $is_live
  AND s.is_active = true
  AND s.id        = $sequence_id;
