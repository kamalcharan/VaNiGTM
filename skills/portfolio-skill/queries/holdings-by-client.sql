-- KI-26: Holdings by client with latest NAV and scheme details
-- Joins holdings → schemes for scheme_name, category
-- Joins holdings → nav_history for latest NAV
-- MUST filter by tenant_id for multi-tenant isolation

SELECT
    h.id              AS holding_id,
    h.scheme_code,
    s.scheme_name,
    s.category,
    s.amc,
    h.units,
    h.avg_nav,
    h.total_invested,
    h.is_sip,
    h.sip_amount,
    h.sip_date,
    h.sip_status,
    latest_nav.nav    AS current_nav,
    latest_nav.nav_date,
    (h.units * latest_nav.nav)                          AS current_value,
    (h.units * latest_nav.nav) - h.total_invested       AS gain_loss,
    CASE
        WHEN h.total_invested > 0
        THEN ROUND(((h.units * latest_nav.nav - h.total_invested) / h.total_invested) * 100, 2)
        ELSE 0
    END                                                  AS gain_pct
FROM ki_holdings h
JOIN ki_schemes s ON s.scheme_code = h.scheme_code
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM ki_nav_history nh
    WHERE nh.scheme_code = h.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) latest_nav ON true
WHERE h.tenant_id = $tenant_id
  AND h.client_id = $client_id
  AND h.units > 0
ORDER BY (h.units * COALESCE(latest_nav.nav, h.avg_nav)) DESC;
