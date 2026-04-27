-- get_conversion_funnel: pipeline stage distribution
-- Named params: $tenant_id, $is_live, $campaign_id (nullable)

WITH counts AS (
    SELECT
        stage,
        COUNT(*)::int AS count
    FROM gt_contact_assignments
    WHERE tenant_id = $tenant_id
      AND is_live   = $is_live
      AND ($campaign_id::bigint IS NULL OR campaign_id = $campaign_id::bigint)
    GROUP BY stage
),
total AS (
    SELECT COALESCE(SUM(count), 0)::int AS total FROM counts
)
SELECT
    s.stage,
    COALESCE(c.count, 0)::int AS count,
    CASE WHEN t.total > 0
         THEN ROUND(COALESCE(c.count, 0)::numeric / t.total * 100, 1)
         ELSE 0 END AS pct
FROM (VALUES ('identified'),('contacted'),('engaged'),('interested'),('qualified'),('converted'),('lost')) AS s(stage)
LEFT JOIN counts c ON c.stage = s.stage
CROSS JOIN total t
ORDER BY CASE s.stage
    WHEN 'identified' THEN 1
    WHEN 'contacted'  THEN 2
    WHEN 'engaged'    THEN 3
    WHEN 'interested' THEN 4
    WHEN 'qualified'  THEN 5
    WHEN 'converted'  THEN 6
    WHEN 'lost'       THEN 7
END;
