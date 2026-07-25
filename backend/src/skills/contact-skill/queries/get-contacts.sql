-- get_contacts: paginated contact list with primary channel info
-- PERFORMANCE: CTE paginates first (LIMIT/OFFSET on gt_contacts), then
-- LATERAL joins fetch channels only for the returned page rows.
-- Named params: $tenant_id, $is_live, $show_inactive (boolean),
--               $search (nullable), $limit, $offset

WITH paged AS (
    SELECT
        c.id,
        c.contact_no,
        c.prefix,
        c.name,
        c.normalized_name,
        c.is_active,
        c.job_title,
        c.company_name,
        c.company_domain,
        c.location,
        c.source,
        c.score,
        c.created_at
    FROM gt_contacts c
    WHERE c.tenant_id = $tenant_id
      AND c.is_live   = $is_live
      AND c.is_active = (NOT $show_inactive::boolean)
      AND (
          $search::text IS NULL
          OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
          OR c.name ILIKE '%' || $search::text || '%'
          OR c.company_name ILIKE '%' || $search::text || '%'
          OR EXISTS (
              SELECT 1 FROM gt_contact_channels ch
              WHERE ch.contact_id   = c.id
                AND ch.is_live      = c.is_live
                AND ch.is_active    = true
                AND ch.channel_value ILIKE '%' || $search::text || '%'
          )
      )
    ORDER BY c.name ASC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    p.*,
    mob.channel_value AS primary_mobile,
    em.channel_value  AS primary_email
FROM paged p

-- Primary mobile — index seek on (contact_id, is_live, channel_type)
LEFT JOIN LATERAL (
    SELECT channel_value
    FROM gt_contact_channels
    WHERE contact_id   = p.id
      AND is_live      = $is_live
      AND is_active    = true
      AND channel_type = 'mobile'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
) mob ON true

-- Primary email — same index
LEFT JOIN LATERAL (
    SELECT channel_value
    FROM gt_contact_channels
    WHERE contact_id   = p.id
      AND is_live      = $is_live
      AND is_active    = true
      AND channel_type = 'email'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
) em ON true

ORDER BY p.name ASC;
