-- get-stats: client dashboard summary
-- Named params: $tenant_id, $is_live, $user_id

SELECT
    COUNT(*)                                                                  AS total_clients,
    COUNT(*) FILTER (WHERE cl.is_active = true)                               AS active_clients,
    COUNT(*) FILTER (WHERE cl.onboarding_status IN ('pending', 'in_progress')) AS pending_onboarding,
    COUNT(bm.id) FILTER (WHERE bm.is_active = true AND bm.user_id = $user_id) AS bookmarked
FROM ki_clients cl
LEFT JOIN ki_client_bookmarks bm
       ON bm.client_id = cl.id AND bm.is_live = cl.is_live
WHERE cl.tenant_id = $tenant_id
  AND cl.is_live   = $is_live;
