-- get_sequence_performance: all sequences with campaign name and step count
-- Named params: $tenant_id, $is_live, $campaign_id (nullable)

SELECT
    s.id,
    s.name,
    s.status,
    s.contacts_count,
    s.avg_open_rate,
    s.avg_reply_rate,
    c.name AS campaign_name,
    COALESCE(sc.cnt, 0)::int AS step_count
FROM gt_sequences s
JOIN gt_campaigns c ON c.id = s.campaign_id
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM gt_sequence_steps
    WHERE sequence_id = s.id AND is_live = $is_live
) sc ON true
WHERE s.tenant_id = $tenant_id
  AND s.is_live   = $is_live
  AND s.is_active = true
  AND ($campaign_id::bigint IS NULL OR s.campaign_id = $campaign_id::bigint)
ORDER BY s.avg_reply_rate DESC NULLS LAST, s.name ASC;
