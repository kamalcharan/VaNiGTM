-- KI-27: Client list with key metrics for a tenant
-- Joins with holdings for AUM, SIP counts
-- MUST filter by tenant_id for multi-tenant isolation

SELECT
    c.id,
    c.name,
    c.email,
    c.phone,
    c.risk_overall                                       AS risk_profile,
    c.tags,
    c.last_interaction_at                                AS last_interaction_date,
    COALESCE(portfolio_agg.total_value, 0)               AS aum,
    COALESCE(portfolio_agg.sip_count, 0)                 AS sip_count,
    COALESCE(portfolio_agg.active_sips_total, 0)         AS active_sips_total,
    COALESCE(goals_agg.goals_count, 0)                   AS goals_count
FROM ki_clients c
LEFT JOIN LATERAL (
    SELECT
        SUM(h.units * COALESCE(ln.nav, h.avg_nav))      AS total_value,
        COUNT(*) FILTER (WHERE h.is_sip = true)          AS sip_count,
        SUM(h.sip_amount) FILTER (WHERE h.sip_status = 'active') AS active_sips_total
    FROM ki_holdings h
    LEFT JOIN LATERAL (
        SELECT nav FROM ki_nav_history nh
        WHERE nh.scheme_code = h.scheme_code
        ORDER BY nh.nav_date DESC LIMIT 1
    ) ln ON true
    WHERE h.tenant_id = $tenant_id AND h.client_id = c.id AND h.units > 0
) portfolio_agg ON true
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS goals_count
    FROM ki_goals g
    WHERE g.tenant_id = $tenant_id AND g.client_id = c.id AND g.status = 'active'
) goals_agg ON true
WHERE c.tenant_id = $tenant_id
  AND c.active = true
ORDER BY c.name ASC;
