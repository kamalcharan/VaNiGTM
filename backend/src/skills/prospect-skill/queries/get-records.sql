-- get_records: ONE query for both record surfaces.
--
-- Reads gt_record_view (migration 204), which defines an imported record once
-- for both scopes. `scope` is the only thing that differs:
--
--   'mine' -> gt_prospects, TENANT-SCOPED
--   'pool' -> gt_universe_company_sources, cross-tenant, admin only
--
-- ISOLATION: the view spans a tenant table and a cross-tenant one, so the
-- tenant filter is applied here and is not optional. A 'mine' row is only ever
-- returned for the calling tenant and environment; 'pool' is gated on
-- ctx.is_admin in the function before this query is reached.
--
-- Named params: $scope, $tenant_id, $is_live, $search, $relationship,
--               $tag_id, $only_duplicates, $min_quality, $industry, $domain,
--               $industry_canonical, $industry_sub, $research,
--               $show_inactive, $limit, $offset
--
-- NOTE: a named param written in a COMMENT is still translated — the
-- substitution scans the whole file. Do not name one here that the caller
-- does not supply.

WITH paged AS (
    -- The filtered total, carried on every row. The stats query answers a
    -- different question — the health of the WHOLE set — and using it for
    -- "showing N of M" would report the unfiltered count.
    SELECT v.*, COUNT(*) OVER () AS filtered_total
    FROM   gt_record_view v
    WHERE  v.scope = $scope::text
      -- The whole isolation guarantee, in one clause.
      AND  ( v.scope = 'pool'
             OR (v.tenant_id = $tenant_id::uuid AND v.is_live = $is_live::boolean) )
      AND  ($relationship::text IS NULL OR v.relationship = $relationship::text)
      AND  ($min_quality::numeric IS NULL OR COALESCE(v.completeness, 0) >= $min_quality::numeric)
      AND  (NOT $only_duplicates::boolean OR v.duplicate)
      -- Deactivated rows are HIDDEN by default, not unreachable. A pool row
      -- is always active — a delivery is retired at the load, not per row.
      AND  ($show_inactive::boolean OR v.is_active)
      AND  ($industry::text IS NULL OR v.industry_raw = $industry::text)
      -- The DERIVED classification (migrations 206, 218). industry_raw is a
      -- product description — "Manufacturing of Bulk Drugs" and
      -- "Manufacturing of Plastic Chairs" are both manufacturing and share
      -- nothing else — so a segment has to filter on the cluster and the
      -- sub-cluster, not the raw text.
      AND  ($industry_canonical::text IS NULL
            OR v.industry_canonical = $industry_canonical::text)
      AND  ($industry_sub::text IS NULL OR v.industry_sub = $industry_sub::text)
      -- Research state, so "who have I not looked at yet" is a filter rather
      -- than a spreadsheet exercise. Pool rows have no briefs and are
      -- excluded by any value other than NULL.
      AND  ($research::text IS NULL
            OR (v.scope = 'mine' AND (
                 ($research::text = 'none' AND NOT EXISTS (
                     SELECT 1 FROM gt_account_briefs b
                      WHERE b.prospect_id = v.id AND b.tenant_id = $tenant_id::uuid
                        AND b.is_live = $is_live::boolean))
              OR ($research::text = 'done' AND EXISTS (
                     SELECT 1 FROM gt_account_briefs b
                      WHERE b.prospect_id = v.id AND b.tenant_id = $tenant_id::uuid
                        AND b.is_live = $is_live::boolean AND b.facts_at IS NOT NULL))
              OR ($research::text = 'failed' AND EXISTS (
                     SELECT 1 FROM gt_account_briefs b
                      WHERE b.prospect_id = v.id AND b.tenant_id = $tenant_id::uuid
                        AND b.is_live = $is_live::boolean
                        AND b.status IN ('extract_failed','unreadable')))
              OR ($research::text = 'decided' AND EXISTS (
                     SELECT 1 FROM gt_account_briefs b
                      WHERE b.prospect_id = v.id AND b.tenant_id = $tenant_id::uuid
                        AND b.is_live = $is_live::boolean AND b.decided_at IS NOT NULL))
            )))
      -- 'has' / 'none' answer "which of these can we actually reach", which
      -- is a different question from matching a particular domain.
      AND  ($domain::text IS NULL
            OR ($domain::text = 'has'  AND v.domain_normalized IS NOT NULL)
            OR ($domain::text = 'none' AND v.domain_normalized IS NULL)
            OR ($domain::text NOT IN ('has','none')
                AND v.domain_normalized ILIKE '%' || $domain::text || '%'))
      AND  (
          $search::text IS NULL
          OR v.name ILIKE '%' || $search::text || '%'
          OR v.domain_normalized ILIKE '%' || $search::text || '%'
          OR v.city ILIKE '%' || $search::text || '%'
          OR v.industry_raw ILIKE '%' || $search::text || '%'
      )
      -- A tag matches whether it was applied to the record or inherited from
      -- the delivery it arrived in.
      AND  (
          $tag_id::bigint IS NULL
          OR EXISTS (SELECT 1 FROM gt_load_tags lt
                     WHERE lt.load_id = v.load_id AND lt.tag_id = $tag_id::bigint)
          OR (v.scope = 'mine' AND EXISTS (
                SELECT 1 FROM gt_prospect_tags pt
                WHERE pt.prospect_id = v.id AND pt.tag_id = $tag_id::bigint))
      )
    ORDER BY v.recorded_at DESC, v.id DESC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    pg.*,
    l.label AS source_label,
    -- Freshness banding, defined once for both scopes.
    CASE
        WHEN pg.source_as_of IS NULL THEN 'unknown'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '6 months')  THEN 'current'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '18 months') THEN 'recent'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '36 months') THEN 'ageing'
        ELSE 'stale'
    END AS freshness,
    COALESCE(tg.tags, '[]'::json) AS tags,
    -- Research state on the list itself (NEXT item 10). DERIVED from the
    -- brief, deliberately not a tag: a tag is a human assertion about a
    -- company and this is a fact about what we did.
    br.status                     AS research_status,
    br.facts_at IS NOT NULL       AS researched,
    br.decided_at IS NOT NULL     AS research_decided,
    COALESCE(br.human_offer, br.recommended_offer) AS research_offer,
    br.updated_at                 AS researched_at
FROM paged pg
LEFT JOIN gt_source_loads l ON l.id = pg.load_id
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', t.id, 'label', t.label, 'inherited', src.inherited)
                    ORDER BY t.label) AS tags
    FROM (
        SELECT lt.tag_id, true AS inherited
        FROM   gt_load_tags lt WHERE lt.load_id = pg.load_id
        UNION
        SELECT pt.tag_id, false
        FROM   gt_prospect_tags pt
        WHERE  pg.scope = 'mine' AND pt.prospect_id = pg.id
    ) src
    JOIN gt_tags t ON t.id = src.tag_id AND t.is_active = true
) tg ON true
LEFT JOIN gt_account_briefs br
       ON pg.scope = 'mine'
      AND br.prospect_id = pg.id
      AND br.tenant_id   = $tenant_id::uuid
      AND br.is_live     = $is_live::boolean
ORDER BY pg.recorded_at DESC, pg.id DESC;
