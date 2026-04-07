-- count-contacts: total count for pagination
-- Named params: $tenant_id, $is_live, $search (nullable), $is_client (nullable)

SELECT COUNT(*) AS total
FROM ki_contacts c
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = true
  AND (
      $search IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search) || '%'
      OR c.name ILIKE '%' || $search || '%'
  )
  AND (
      $is_client IS NULL
      OR c.is_client = $is_client
  );
