INSERT INTO gt_sequence_steps
  (sequence_id, tenant_id, is_live, step_type, title, description,
   day_offset, wait_duration_hours, condition_type, channel_id, sort_order)
VALUES
  ($sequence_id, $tenant_id, $is_live, $step_type, $title, $description,
   $day_offset, $wait_duration_hours, $condition_type, $channel_id,
   COALESCE(
     (SELECT MAX(sort_order) + 1 FROM gt_sequence_steps
      WHERE sequence_id = $sequence_id AND is_live = $is_live),
     0
   ))
RETURNING id, step_type, title, day_offset, sort_order, created_at
