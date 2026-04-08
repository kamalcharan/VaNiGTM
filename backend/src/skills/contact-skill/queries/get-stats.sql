-- get-stats: contact dashboard summary stats
-- Named params: $tenant_id, $is_live

SELECT
    COUNT(*)                                      AS total_contacts,
    COUNT(*) FILTER (WHERE c.is_client = true)    AS total_clients,
    COUNT(*) FILTER (WHERE c.is_client = false)   AS total_prospects,
    COUNT(s.id)                                   AS has_snapshot
FROM ki_contacts c
LEFT JOIN ki_contact_snapshot s
       ON s.contact_id = c.id
      AND s.is_live    = c.is_live
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = true;
