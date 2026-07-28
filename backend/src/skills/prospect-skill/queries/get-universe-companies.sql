-- get_universe_companies: the COMMON POOL — company records delivered by
-- directories and providers, shared across tenants.
--
-- NOT tenant-scoped, by design: gt_universe_company_sources is cross-tenant
-- infrastructure like gt_prompts and gt_events. Access is gated on
-- vn_tenants.is_admin in the calling function, read from the database rather
-- than taken from a claim.
--
-- These are the immutable SOURCE rows. The merged golden record
-- (gt_universe_companies) is derived from them by the Phase B merge engine,
-- which is not built — so `resolved` is false for everything today, and the
-- UI says so rather than implying a merge happened.
--
-- Named params: $search (nullable), $load_id (nullable), $tag_id (nullable),
--               $only_duplicates (boolean), $limit, $offset

WITH dupe_block AS (
    SELECT blocking_key
    FROM   gt_universe_company_sources
    WHERE  blocking_key IS NOT NULL
    GROUP  BY blocking_key
    HAVING COUNT(*) > 1
),
paged AS (
    SELECT
        u.id, u.name, u.source_record_id, u.domain_normalized, u.website,
        u.email, u.phone, u.city, u.state_code, u.pin, u.country,
        u.industry_raw, u.employees_band, u.revenue_band, u.linkedin_url,
        u.year_founded, u.description,
        u.completeness, u.validity, u.source_as_of, u.load_id,
        u.company_id IS NOT NULL AS resolved,
        (u.blocking_key IN (SELECT blocking_key FROM dupe_block)) AS shares_block
    FROM gt_universe_company_sources u
    WHERE ($load_id::bigint IS NULL OR u.load_id = $load_id::bigint)
      AND (
          $search::text IS NULL
          OR u.name ILIKE '%' || $search::text || '%'
          OR u.domain_normalized ILIKE '%' || $search::text || '%'
          OR u.city ILIKE '%' || $search::text || '%'
          OR u.industry_raw ILIKE '%' || $search::text || '%'
      )
      AND (NOT $only_duplicates::boolean
           OR u.blocking_key IN (SELECT blocking_key FROM dupe_block))
      AND ($tag_id::bigint IS NULL
           OR EXISTS (SELECT 1 FROM gt_load_tags lt
                      WHERE lt.load_id = u.load_id AND lt.tag_id = $tag_id::bigint))
    ORDER BY u.ingested_at DESC, u.id DESC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    pg.*,
    l.label  AS load_label,
    ds.code  AS source_code,
    CASE
        WHEN pg.source_as_of IS NULL THEN 'unknown'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '6 months')  THEN 'current'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '18 months') THEN 'recent'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '36 months') THEN 'ageing'
        ELSE 'stale'
    END AS freshness,
    COALESCE(tg.tags, '[]'::json) AS tags
FROM paged pg
LEFT JOIN gt_source_loads l  ON l.id = pg.load_id
LEFT JOIN gt_data_sources ds ON ds.id = l.source_id
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object('id', t.id, 'label', t.label, 'inherited', true)
                    ORDER BY t.label) AS tags
    FROM   gt_load_tags lt
    JOIN   gt_tags t ON t.id = lt.tag_id AND t.is_active = true
    WHERE  lt.load_id = pg.load_id
) tg ON true
ORDER BY pg.id DESC;
