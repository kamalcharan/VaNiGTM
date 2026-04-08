-- get-clients: paginated client list with contact info and bookmark status
-- Named params: $tenant_id, $is_live, $search (nullable), $risk_profile (nullable),
--               $user_id, $limit, $offset

SELECT
    cl.id,
    cl.client_uid,
    cl.ext_ref_id,
    cl.pan,
    cl.dob,
    cl.risk_profile,
    cl.onboarding_status,
    cl.created_at,

    -- Contact details
    c.prefix,
    c.name,

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
  AND cl.is_active = true
  AND (
      $search::text IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
      OR c.name ILIKE '%' || $search::text || '%'
      OR cl.pan ILIKE '%' || $search::text || '%'
      OR cl.ext_ref_id ILIKE '%' || $search::text || '%'
  )
  AND (
      $risk_profile::text IS NULL
      OR cl.risk_profile = $risk_profile::text
  )
  AND (
      $bookmarked_only::boolean IS NULL OR $bookmarked_only::boolean = false
      OR bm.is_active = true
  )
ORDER BY c.name ASC
LIMIT  $limit
OFFSET $offset;
