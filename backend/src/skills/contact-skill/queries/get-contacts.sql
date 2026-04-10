-- get_contacts: paginated contact list with primary channel info
-- PERFORMANCE: CTE paginates first (LIMIT/OFFSET on ki_contacts), then
-- LATERAL joins fetch channels only for the returned page rows — not for
-- all matching rows. Previously, correlated subqueries ran for every
-- matching row before LIMIT was applied (O(N) sub-executions).
-- Named params: $tenant_id, $is_live, $show_inactive (boolean),
--               $search (nullable), $is_client (nullable), $limit, $offset

WITH paged AS (
    SELECT
        c.id,
        c.contact_no,
        c.prefix,
        c.name,
        c.normalized_name,
        c.is_client,
        c.is_active,
        c.age,
        c.city,
        c.marital_status,
        c.dependents_count,
        c.created_at
    FROM ki_contacts c
    WHERE c.tenant_id = $tenant_id
      AND c.is_live   = $is_live
      AND c.is_active = (NOT $show_inactive::boolean)
      AND (
          $search::text IS NULL
          OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
          OR c.name ILIKE '%' || $search::text || '%'
      )
      AND (
          $is_client::boolean IS NULL
          OR c.is_client = $is_client::boolean
      )
    ORDER BY c.name ASC
    LIMIT  $limit
    OFFSET $offset
)
SELECT
    p.*,
    mob.channel_value                AS primary_mobile,
    em.channel_value                 AS primary_email,
    (snap.contact_id IS NOT NULL)    AS has_snapshot
FROM paged p

-- Primary mobile — index seek on (contact_id, is_live, channel_type)
LEFT JOIN LATERAL (
    SELECT channel_value
    FROM ki_contact_channels
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
    FROM ki_contact_channels
    WHERE contact_id   = p.id
      AND is_live      = $is_live
      AND is_active    = true
      AND channel_type = 'email'
    ORDER BY is_primary DESC, created_at ASC
    LIMIT 1
) em ON true

-- Snapshot existence — idx_ki_snapshots_contact
LEFT JOIN LATERAL (
    SELECT contact_id
    FROM ki_contact_snapshots
    WHERE contact_id = p.id
      AND is_live    = $is_live
    LIMIT 1
) snap ON true

ORDER BY p.name ASC;
