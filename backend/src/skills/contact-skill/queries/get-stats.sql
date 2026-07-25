-- get-stats: contact dashboard summary stats
-- Named params: $tenant_id, $is_live

SELECT
    COUNT(*)                                    AS total_contacts,
    COUNT(*) FILTER (WHERE c.score >= 60)       AS high_fit_contacts,
    COUNT(DISTINCT c.company_domain)
        FILTER (WHERE c.company_domain IS NOT NULL) AS distinct_companies
FROM gt_contacts c
WHERE c.tenant_id = $tenant_id
  AND c.is_live   = $is_live
  AND c.is_active = true;
