-- get_campaigns: paginated campaign list with persona count
-- PERFORMANCE: CTE paginates first, LATERAL fetches persona count only for page rows
-- Named params: $tenant_id, $is_live, $search (nullable), $status (nullable), $limit, $offset

WITH paged AS (
    SELECT
        c.id,
        c.campaign_no,
        c.name,
        c.description,
        c.status,
        c.target_industries,
        c.product_name,
        c.sender_name,
        c.launched_at,
        c.created_at
    FROM gt_campaigns c
    WHERE c.tenant_id = $tenant_id
      AND c.is_live   = $is_live
      AND c.is_active = true
      AND (
          $search::text IS NULL
          OR c.name ILIKE '%' || $search::text || '%'
          OR c.description ILIKE '%' || $search::text || '%'
      )
      AND (
          $status::text IS NULL
          OR c.status = $status::text
      )
    ORDER BY c.created_at DESC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    p.*,
    COALESCE(pc.cnt, 0)::int AS persona_count
FROM paged p
LEFT JOIN LATERAL (
    SELECT COUNT(*)::int AS cnt
    FROM gt_personas
    WHERE campaign_id = p.id
      AND is_live     = $is_live
      AND is_active   = true
) pc ON true
ORDER BY p.created_at DESC;
