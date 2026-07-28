-- count_prospects: total matching the same filters as get-prospects.sql.
-- Kept in step with that file — a filter added there must be added here.
--
-- Named params: $tenant_id, $is_live, $relationship, $search, $tag_id,
--               $only_duplicates, $min_quality

WITH
dupe_domain AS (
    SELECT domain_normalized
    FROM   gt_prospects
    WHERE  tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
      AND  domain_normalized IS NOT NULL
    GROUP  BY domain_normalized
    HAVING COUNT(*) > 1
),
dupe_name AS (
    SELECT name_key
    FROM   gt_prospects
    WHERE  tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
      AND  name_key <> ''
    GROUP  BY name_key
    HAVING COUNT(*) > 1
)
SELECT COUNT(*)::bigint AS total
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
  AND (
      $tag_id::bigint IS NULL
      OR EXISTS (SELECT 1 FROM gt_prospect_tags pt
                 WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint)
      OR EXISTS (SELECT 1 FROM gt_load_tags lt
                 WHERE lt.load_id = p.load_id AND lt.tag_id = $tag_id::bigint)
  );
