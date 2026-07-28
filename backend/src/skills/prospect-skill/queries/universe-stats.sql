-- universe_stats: health of the common pool, same components as the tenant
-- side — fill rate and validity separately, freshness banded, duplicates
-- counted rather than merged.
--
-- `resolved` counts source rows already folded into a golden record. That is
-- 0 until the Phase B merge engine exists, and showing it as 0 is the point:
-- the pool holds source rows that nothing has merged yet.
--
-- Named params: none

SELECT
    COUNT(*)::int                                                          AS total,
    COUNT(DISTINCT load_id)::int                                           AS loads,
    COUNT(*) FILTER (WHERE company_id IS NOT NULL)::int                    AS resolved,
    ROUND(AVG(completeness)::numeric, 3)                                   AS avg_completeness,
    ROUND(AVG(validity)::numeric, 3)                                       AS avg_validity,
    COUNT(*) FILTER (WHERE COALESCE(validity, 1) < 1)::int                 AS with_rejected_fields,
    COUNT(*) FILTER (WHERE domain_normalized IS NOT NULL)::int             AS with_domain,
    COUNT(*) FILTER (WHERE source_as_of IS NULL)::int                      AS undated,
    (SELECT COALESCE(SUM(n), 0)::int FROM (
        SELECT COUNT(*) AS n FROM gt_universe_company_sources
        WHERE blocking_key IS NOT NULL
        GROUP BY blocking_key HAVING COUNT(*) > 1
    ) d)                                                                   AS sharing_block
FROM gt_universe_company_sources;
