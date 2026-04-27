-- count_campaigns: total matching campaigns for pagination
-- Named params: $tenant_id, $is_live, $search (nullable), $status (nullable)

SELECT COUNT(*)::int AS total
FROM gt_campaigns
WHERE tenant_id = $tenant_id
  AND is_live   = $is_live
  AND is_active = true
  AND (
      $search::text IS NULL
      OR name ILIKE '%' || $search::text || '%'
      OR description ILIKE '%' || $search::text || '%'
  )
  AND (
      $status::text IS NULL
      OR status = $status::text
  );
