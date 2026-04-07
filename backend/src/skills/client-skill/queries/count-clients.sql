-- count-clients: total for pagination
-- Named params: $tenant_id, $is_live, $search (nullable), $risk_profile (nullable), $user_id, $bookmarked_only (nullable)

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
      $search IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search) || '%'
      OR c.name ILIKE '%' || $search || '%'
      OR cl.pan ILIKE '%' || $search || '%'
      OR cl.ext_ref_id ILIKE '%' || $search || '%'
  )
  AND ($risk_profile IS NULL OR cl.risk_profile = $risk_profile)
  AND ($bookmarked_only IS NULL OR $bookmarked_only = false OR bm.is_active = true);
