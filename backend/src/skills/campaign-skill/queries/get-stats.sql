-- get_stats: campaign summary counts
-- Named params: $tenant_id, $is_live

SELECT
    COUNT(*)::int                                     AS total,
    COUNT(*) FILTER (WHERE status = 'draft')::int     AS draft,
    COUNT(*) FILTER (WHERE status = 'active')::int    AS active,
    COUNT(*) FILTER (WHERE status = 'paused')::int    AS paused,
    COUNT(*) FILTER (WHERE status = 'completed')::int AS completed
FROM gt_campaigns
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true;
