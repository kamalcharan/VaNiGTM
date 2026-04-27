-- get_pipeline_stats: contact counts per stage for a campaign
-- Named params: $tenant_id, $is_live, $campaign_id

SELECT
    COUNT(*)::int                                        AS total,
    COUNT(*) FILTER (WHERE stage = 'identified')::int    AS identified,
    COUNT(*) FILTER (WHERE stage = 'contacted')::int     AS contacted,
    COUNT(*) FILTER (WHERE stage = 'engaged')::int       AS engaged,
    COUNT(*) FILTER (WHERE stage = 'interested')::int    AS interested,
    COUNT(*) FILTER (WHERE stage = 'qualified')::int     AS qualified,
    COUNT(*) FILTER (WHERE stage = 'converted')::int     AS converted,
    COUNT(*) FILTER (WHERE stage = 'lost')::int          AS lost
FROM gt_contact_assignments
WHERE tenant_id   = $tenant_id
  AND is_live     = $is_live
  AND campaign_id = $campaign_id;
