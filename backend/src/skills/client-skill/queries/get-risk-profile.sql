-- get-risk-profile: client risk dimensions with portfolio and goals context
-- Named params: $tenant_id, $is_live, $client_id

SELECT
    c.name,
    cl.risk_capacity,
    cl.risk_tolerance,
    cl.risk_required,
    cl.risk_overall,
    cl.annual_income,
    cl.dob,
    cl.occupation,
    COALESCE(SUM(h.cost_basis), 0)    AS total_invested,
    COALESCE(SUM(h.current_value), 0) AS current_value,
    COUNT(g.id) FILTER (WHERE g.status = 'active') AS goals_count,
    COALESCE(
        AVG(EXTRACT(YEAR FROM AGE(g.target_date, now()))) FILTER (WHERE g.status = 'active'),
        0
    ) AS avg_goal_years,
    cl.updated_at

FROM ki_clients cl
JOIN ki_contacts c ON c.id = cl.contact_id
LEFT JOIN ki_holdings h
       ON h.client_id = cl.id
      AND h.tenant_id = cl.tenant_id
      AND h.is_live   = cl.is_live
LEFT JOIN ki_goals g
       ON g.client_id = cl.id
      AND g.tenant_id = cl.tenant_id
      AND g.is_live   = cl.is_live

WHERE cl.id        = $client_id
  AND cl.tenant_id = $tenant_id
  AND cl.is_live   = $is_live
  AND cl.is_active = true

GROUP BY
    c.name, cl.risk_capacity, cl.risk_tolerance, cl.risk_required,
    cl.risk_overall, cl.annual_income, cl.dob, cl.occupation, cl.updated_at;
