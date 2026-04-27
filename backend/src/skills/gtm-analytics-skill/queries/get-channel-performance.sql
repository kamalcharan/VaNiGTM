-- get_channel_performance: per-channel send/reply/open stats
-- Named params: $tenant_id, $is_live, $campaign_id (nullable), $days

SELECT
    channel_type,
    SUM(total_sent)::int       AS total_sent,
    SUM(total_replies)::int    AS total_replied,
    0::int                     AS total_opened,
    CASE WHEN SUM(total_sent) > 0
         THEN ROUND(SUM(total_replies)::numeric / SUM(total_sent) * 100, 1)
         ELSE 0 END            AS reply_rate,
    0::numeric                 AS open_rate
FROM gt_channels
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true
GROUP BY channel_type
ORDER BY total_sent DESC;
