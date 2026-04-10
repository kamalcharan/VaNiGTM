-- count-contacts: total count for pagination
-- Named params: $tenant_id, $is_live, $show_inactive (boolean), $search (nullable), $is_client (nullable)

SELECT COUNT(*) AS total
FROM ki_contacts c
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = (NOT $show_inactive::boolean)
  AND (
      $search::text IS NULL
      OR c.normalized_name ILIKE '%' || UPPER($search::text) || '%'
      OR c.name ILIKE '%' || $search::text || '%'
      OR EXISTS (
          SELECT 1 FROM ki_contact_channels ch
          WHERE ch.contact_id    = c.id
            AND ch.is_live       = c.is_live
            AND ch.is_active     = true
            AND ch.channel_value ILIKE '%' || $search::text || '%'
      )
  )
  AND (
      $is_client::boolean IS NULL
      OR c.is_client = $is_client::boolean
  );
