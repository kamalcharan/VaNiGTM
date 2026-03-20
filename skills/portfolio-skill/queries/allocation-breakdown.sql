-- KI-26: Asset allocation breakdown by category
-- Groups holdings by scheme category with latest NAV valuation
-- MUST filter by tenant_id for multi-tenant isolation

SELECT
    s.category,
    COUNT(DISTINCT h.scheme_code)                       AS scheme_count,
    SUM(h.units * latest_nav.nav)                       AS value,
    ROUND(
        SUM(h.units * latest_nav.nav) * 100.0
        / NULLIF(SUM(SUM(h.units * latest_nav.nav)) OVER (), 0),
        2
    )                                                    AS percentage
FROM ki_holdings h
JOIN ki_schemes s ON s.scheme_code = h.scheme_code
LEFT JOIN LATERAL (
    SELECT nav
    FROM ki_nav_history nh
    WHERE nh.scheme_code = h.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) latest_nav ON true
WHERE h.tenant_id = $tenant_id
  AND h.client_id = $client_id
  AND h.units > 0
GROUP BY s.category
ORDER BY value DESC;
