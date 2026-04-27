-- get_sequences: list sequences for a campaign with step count
-- Named params: $tenant_id, $is_live, $campaign_id

SELECT
    s.id, s.name, s.description, s.status,
    s.contacts_count, s.avg_open_rate, s.avg_reply_rate,
    s.sort_order, s.created_at,
    COALESCE(sc.cnt, 0)::int AS step_count
FROM gt_sequences s
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM gt_sequence_steps
    WHERE sequence_id = s.id AND is_live = $is_live
) sc ON true
WHERE s.tenant_id   = $tenant_id
  AND s.is_live     = $is_live
  AND s.is_active   = true
  AND s.campaign_id = $campaign_id
ORDER BY s.sort_order ASC, s.created_at ASC;
