-- record_facets: the values a filter can actually offer, with counts.
--
-- Offering an industry that matches nothing is worse than offering none: the
-- user picks it, sees an empty table, and cannot tell whether the filter or
-- the data is at fault. So the list comes from the data itself.
--
-- Named params: $scope, $tenant_id, $is_live

WITH visible AS (
    SELECT v.*
    FROM   gt_record_view v
    WHERE  v.scope = $scope::text
      AND  ( v.scope = 'pool'
             OR (v.tenant_id = $tenant_id::uuid AND v.is_live = $is_live::boolean) )
      AND  v.is_active
)
SELECT
    (SELECT COALESCE(json_agg(json_build_object('value', industry_raw, 'count', n)
                              ORDER BY n DESC, industry_raw), '[]'::json)
     FROM (
        SELECT industry_raw, COUNT(*)::int AS n
        FROM   visible WHERE industry_raw IS NOT NULL
        GROUP  BY industry_raw
        -- The long tail is 2,050 values seen once. A dropdown of those is not
        -- a filter, it is a list — search covers them instead.
        HAVING COUNT(*) > 1
        ORDER  BY n DESC LIMIT 100
     ) i)                                                AS industries,

    (SELECT COALESCE(json_agg(json_build_object('id', t.id, 'label', t.label, 'count', c.n)
                              ORDER BY t.label), '[]'::json)
     FROM (
        SELECT lt.tag_id, COUNT(*)::int AS n
        FROM   visible v JOIN gt_load_tags lt ON lt.load_id = v.load_id
        GROUP  BY lt.tag_id
     ) c JOIN gt_tags t ON t.id = c.tag_id AND t.is_active)  AS tags,

    (SELECT COUNT(*)::int FROM visible WHERE domain_normalized IS NOT NULL) AS with_domain,
    (SELECT COUNT(*)::int FROM visible WHERE domain_normalized IS NULL)     AS without_domain;
