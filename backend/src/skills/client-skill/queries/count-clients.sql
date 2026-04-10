-- count-clients: total for pagination
-- Named params: $tenant_id, $is_live, $search (nullable), $risk_profile (nullable),
--               $user_id, $bookmarked_only (nullable), $recent_only (nullable), $in_family (nullable)

SELECT COUNT(*) AS total
FROM ki_clients cl
JOIN ki_contacts c ON c.id = cl.contact_id
LEFT JOIN ki_client_bookmarks bm
       ON bm.client_id = cl.id AND bm.user_id = $user_id
      AND bm.is_live = cl.is_live AND bm.is_active = true
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
  AND ($risk_profile::text IS NULL OR cl.risk_profile = $risk_profile::text)
  AND ($bookmarked_only::boolean IS NULL OR $bookmarked_only::boolean = false OR bm.is_active = true)
  AND ($recent_only::boolean IS NULL OR $recent_only::boolean = false OR cl.created_at >= NOW() - INTERVAL '30 days')
  AND ($in_family::boolean IS NULL OR $in_family::boolean = false OR cl.family_id IS NOT NULL);
