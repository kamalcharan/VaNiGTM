-- get_channel_types
-- Master data: all active channel types, optionally filtered by kind
-- (direct | broadcast | asset).
--
-- No tenant filter — this is tenant-agnostic master data (same posture as
-- gt_industries, gt_prompts system rows, gt_content_kinds system rows).

SELECT id, code, name, kind, sort_order
  FROM gt_channel_types
 WHERE is_active = true
   AND ($kind IS NULL OR kind = $kind)
 ORDER BY sort_order, code;
