-- get-clients: paginated client list with contact info and bookmark status
-- Named params: $tenant_id, $is_live, $search (nullable), $risk_profile (nullable),
--               $user_id, $bookmarked_only (nullable), $recent_only (nullable),
--               $in_family (nullable), $show_inactive (boolean, default false), $limit, $offset

SELECT
    cl.id,
    cl.client_uid,
    cl.client_no,
    cl.is_active,
    cl.ext_ref_id,
    cl.pan,
    cl.dob,
    cl.anniversary_date,
    cl.survival_status,
    cl.referred_by_name,
    cl.risk_profile,
    cl.onboarding_status,
    cl.created_at,
    cl.is_family_head,
    cl.family_id,

    -- Contact details
    c.prefix,
    c.name,
    c.contact_no,

    -- Bookmark for this user
    COALESCE(bm.is_active, false) AS is_bookmarked,

    -- Primary mobile
    (
        SELECT ch.channel_value
        FROM ki_contact_channels ch
        WHERE ch.contact_id = c.id AND ch.is_live = cl.is_live
          AND ch.is_active = true AND ch.channel_type = 'mobile'
        ORDER BY ch.is_primary DESC, ch.created_at ASC
        LIMIT 1
    ) AS primary_mobile,

    -- Primary email
    (
        SELECT ch.channel_value
        FROM ki_contact_channels ch
        WHERE ch.contact_id = c.id AND ch.is_live = cl.is_live
          AND ch.is_active = true AND ch.channel_type = 'email'
        ORDER BY ch.is_primary DESC, ch.created_at ASC
        LIMIT 1
    ) AS primary_email

FROM ki_clients cl
JOIN ki_contacts c ON c.id = cl.contact_id
LEFT JOIN ki_client_bookmarks bm
       ON bm.client_id = cl.id
      AND bm.user_id   = $user_id
      AND bm.is_live   = cl.is_live
      AND bm.is_active = true

WHERE cl.tenant_id = $tenant_id
  AND cl.is_live   = $is_live
  AND cl.is_active = (NOT $show_inactive::boolean)
  AND (
      $search::text IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
      OR c.name ILIKE '%' || $search::text || '%'
      OR cl.pan ILIKE '%' || $search::text || '%'
      OR cl.ext_ref_id ILIKE '%' || $search::text || '%'
      OR cl.client_no ILIKE '%' || $search::text || '%'
      OR c.contact_no ILIKE '%' || $search::text || '%'
  )
  AND (
      $risk_profile::text IS NULL
      OR cl.risk_profile = $risk_profile::text
  )
  AND (
      $bookmarked_only::boolean IS NULL OR $bookmarked_only::boolean = false
      OR bm.is_active = true
  )
  AND (
      $recent_only::boolean IS NULL OR $recent_only::boolean = false
      OR cl.created_at >= NOW() - INTERVAL '30 days'
  )
  AND (
      $in_family::boolean IS NULL OR $in_family::boolean = false
      OR EXISTS (
          SELECT 1 FROM ki_families kf
          WHERE kf.head_client_id = cl.id
            AND kf.tenant_id      = cl.tenant_id
            AND kf.is_live        = cl.is_live
      )
  )
ORDER BY c.name ASC
LIMIT  $limit
OFFSET $offset;
