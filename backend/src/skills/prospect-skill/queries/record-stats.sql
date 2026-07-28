-- record_stats: set health for either scope, from the same view and the same
-- expressions the list uses. Quality stays TWO numbers — fill rate and
-- validity — because the profiled file read 100% populated on revenue while
-- 60 of 119 values were the literal string 'undefined+'.
--
-- Named params: $scope, $tenant_id, $is_live

SELECT
    COUNT(*)::int                                            AS total,
    COUNT(DISTINCT load_id)::int                             AS loads,
    COUNT(*) FILTER (WHERE relationship = 'customer')::int    AS customers,
    COUNT(*) FILTER (WHERE resolved)::int                     AS resolved,
    ROUND(AVG(completeness)::numeric, 3)                      AS avg_completeness,
    ROUND(AVG(validity)::numeric, 3)                          AS avg_validity,
    COUNT(*) FILTER (WHERE COALESCE(validity, 1) < 1)::int    AS with_rejected_fields,
    COUNT(*) FILTER (WHERE domain_normalized IS NOT NULL)::int AS with_domain,
    COUNT(*) FILTER (WHERE source_as_of IS NULL)::int          AS undated,
    COUNT(*) FILTER (WHERE duplicate)::int                     AS duplicates
FROM   gt_record_view v
WHERE  v.scope = $scope::text
  AND  ( v.scope = 'pool'
         OR (v.tenant_id = $tenant_id::uuid AND v.is_live = $is_live::boolean) );
