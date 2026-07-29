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

    -- BOTH sources, because the list query filters on both. Offering only
    -- the delivery tags made a tag applied by hand impossible to select: it
    -- existed, it filtered correctly, and it never appeared in the dropdown.
    -- A facet that does not match its own filter is worse than no facet.
    (SELECT COALESCE(json_agg(json_build_object('id', t.id, 'label', t.label, 'count', c.n)
                              ORDER BY t.label), '[]'::json)
     FROM (
        SELECT tag_id, COUNT(DISTINCT id)::int AS n
        FROM (
            -- inherited, from the delivery the record arrived in
            SELECT v.id, lt.tag_id
            FROM   visible v JOIN gt_load_tags lt ON lt.load_id = v.load_id
            UNION
            -- direct, applied to the record afterwards. Only 'mine' has
            -- these: gt_prospect_tags hangs off gt_prospects.
            SELECT v.id, pt.tag_id
            FROM   visible v JOIN gt_prospect_tags pt ON pt.prospect_id = v.id
            WHERE  v.scope = 'mine'
        ) src
        GROUP BY tag_id
     ) c JOIN gt_tags t ON t.id = c.tag_id AND t.is_active)  AS tags,

    -- The DERIVED classification (migrations 206, 218). Short lists by
    -- construction — a handful of clusters, a handful of segments each — so
    -- unlike industry_raw these are genuinely usable as dropdowns, which is
    -- the whole reason the columns exist.
    (SELECT COALESCE(json_agg(json_build_object('value', industry_canonical, 'count', n)
                              ORDER BY n DESC, industry_canonical), '[]'::json)
     FROM (
        SELECT industry_canonical, COUNT(*)::int AS n
        FROM   visible WHERE industry_canonical IS NOT NULL
        GROUP  BY industry_canonical
     ) c)                                                AS clusters,

    (SELECT COALESCE(json_agg(json_build_object('value', industry_sub,
                                                'cluster', industry_canonical,
                                                'count', n)
                              ORDER BY n DESC, industry_sub), '[]'::json)
     FROM (
        SELECT industry_sub, industry_canonical, COUNT(*)::int AS n
        FROM   visible WHERE industry_sub IS NOT NULL
        GROUP  BY industry_sub, industry_canonical
     ) sc)                                               AS segments,

    -- Research state, so the counts on the filter match what picking it shows.
    (SELECT COALESCE(json_build_object(
              'none',    COUNT(*) FILTER (WHERE b.id IS NULL),
              'done',    COUNT(*) FILTER (WHERE b.facts_at IS NOT NULL),
              'failed',  COUNT(*) FILTER (WHERE b.status IN ('extract_failed','unreadable')),
              'decided', COUNT(*) FILTER (WHERE b.decided_at IS NOT NULL)),
              '{}'::json)
     FROM visible v
     LEFT JOIN gt_account_briefs b
            ON v.scope = 'mine' AND b.prospect_id = v.id
           AND b.tenant_id = $tenant_id::uuid AND b.is_live = $is_live::boolean
    )                                                    AS research,

    (SELECT COUNT(*)::int FROM visible WHERE domain_normalized IS NOT NULL) AS with_domain,
    (SELECT COUNT(*)::int FROM visible WHERE domain_normalized IS NULL)     AS without_domain;
