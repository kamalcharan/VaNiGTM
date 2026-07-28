-- get_prospects: the imported company records, with the three things a user
-- asks about them — is this data any good, is it a duplicate, how is it tagged.
--
-- Named params: $tenant_id, $is_live, $relationship (nullable),
--               $search (nullable), $tag_id (nullable), $only_duplicates
--               (boolean), $min_quality (nullable numeric), $limit, $offset

WITH
-- Domains carried by more than one active record. NOT merged automatically
-- and deliberately so: 31 of FTCCI's 1,590 domain-carrying rows share a
-- website with another member — group companies and divisions that are
-- genuinely different businesses. The user decides, so the user must see them.
dupe_domain AS (
    SELECT domain_normalized
    FROM   gt_prospects
    WHERE  tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
      AND  domain_normalized IS NOT NULL
    GROUP  BY domain_normalized
    HAVING COUNT(*) > 1
),
-- Normalised names that collide. Rarer (5 of 2,913 on the real file), which
-- is exactly why a collision here is worth a human look.
dupe_name AS (
    SELECT name_key
    FROM   gt_prospects
    WHERE  tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
      AND  name_key <> ''
    GROUP  BY name_key
    HAVING COUNT(*) > 1
),
paged AS (
    SELECT
        p.id, p.ref, p.name, p.relationship, p.domain_normalized, p.website,
        p.email, p.phone, p.city, p.state_code, p.pin, p.country,
        p.industry_raw, p.employees_band, p.revenue_band, p.linkedin_url,
        p.year_founded, p.description,
        p.completeness, p.validity, p.source_as_of, p.source, p.load_id,
        p.status, p.score, p.created_at,

        (p.domain_normalized IN (SELECT domain_normalized FROM dupe_domain)) AS shares_domain,
        (p.name_key         IN (SELECT name_key         FROM dupe_name))     AS shares_name
    FROM gt_prospects p
    WHERE p.tenant_id = $tenant_id
      AND p.is_live   = $is_live
      AND p.is_active = true
      AND ($relationship::text IS NULL OR p.relationship = $relationship::text)
      AND ($min_quality::numeric IS NULL OR COALESCE(p.completeness, 0) >= $min_quality::numeric)
      AND (
          $search::text IS NULL
          OR p.name ILIKE '%' || $search::text || '%'
          OR p.domain_normalized ILIKE '%' || $search::text || '%'
          OR p.city ILIKE '%' || $search::text || '%'
          OR p.industry_raw ILIKE '%' || $search::text || '%'
      )
      AND (
          NOT $only_duplicates::boolean
          OR p.domain_normalized IN (SELECT domain_normalized FROM dupe_domain)
          OR p.name_key         IN (SELECT name_key         FROM dupe_name)
      )
      -- Tag filter matches EITHER kind: a record tagged directly, or one that
      -- inherits the tag from the delivery it arrived in.
      AND (
          $tag_id::bigint IS NULL
          OR EXISTS (SELECT 1 FROM gt_prospect_tags pt
                     WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint)
          OR EXISTS (SELECT 1 FROM gt_load_tags lt
                     WHERE lt.load_id = p.load_id AND lt.tag_id = $tag_id::bigint)
      )
    ORDER BY p.created_at DESC, p.id DESC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    pg.*,
    l.label   AS load_label,
    l.as_of   AS load_as_of,
    -- Freshness banding mirrors landing.ts / design note §5. Computed here so
    -- the list can show it without every caller re-deriving it.
    CASE
        WHEN pg.source_as_of IS NULL THEN 'unknown'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '6 months')  THEN 'current'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '18 months') THEN 'recent'
        WHEN pg.source_as_of > (CURRENT_DATE - INTERVAL '36 months') THEN 'ageing'
        ELSE 'stale'
    END AS freshness,
    COALESCE(tags.tags, '[]'::json) AS tags
FROM paged pg
LEFT JOIN gt_source_loads l ON l.id = pg.load_id
LEFT JOIN LATERAL (
    SELECT json_agg(json_build_object(
               'id', t.id, 'label', t.label, 'inherited', src.inherited
           ) ORDER BY t.label) AS tags
    FROM (
        SELECT pt.tag_id, false AS inherited
        FROM   gt_prospect_tags pt WHERE pt.prospect_id = pg.id
        UNION
        SELECT lt.tag_id, true
        FROM   gt_load_tags lt WHERE lt.load_id = pg.load_id
    ) src
    JOIN gt_tags t ON t.id = src.tag_id AND t.is_active = true
) tags ON true
ORDER BY pg.created_at DESC, pg.id DESC;
