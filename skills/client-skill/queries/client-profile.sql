-- KI-27: Complete client profile with portfolio and goals summary
-- MUST filter by tenant_id for multi-tenant isolation

SELECT
    c.id,
    c.name,
    c.email,
    c.phone,
    c.pan_encrypted,
    c.pan_last4,
    c.dob,
    c.address,
    c.city,
    c.state,
    c.occupation,
    c.annual_income,
    c.risk_capacity,
    c.risk_tolerance,
    c.risk_required,
    c.risk_overall,
    c.family_group_id,
    c.tags,
    c.notes,
    c.created_at,
    c.last_interaction_at                                AS last_interaction,
    -- Portfolio summary (sub-select)
    COALESCE(ps.total_value, 0)                          AS portfolio_total_value,
    COALESCE(ps.total_invested, 0)                       AS portfolio_total_invested,
    CASE
        WHEN COALESCE(ps.total_invested, 0) > 0
        THEN ROUND(((ps.total_value - ps.total_invested) / ps.total_invested) * 100, 2)
        ELSE 0
    END                                                  AS portfolio_return_pct,
    COALESCE(ps.scheme_count, 0)                         AS portfolio_scheme_count,
    -- Goals summary (sub-select)
    COALESCE(gs.total_goals, 0)                          AS goals_total,
    COALESCE(gs.on_track, 0)                             AS goals_on_track,
    COALESCE(gs.at_risk, 0)                              AS goals_at_risk,
    COALESCE(gs.behind, 0)                               AS goals_behind
FROM clients c
LEFT JOIN LATERAL (
    SELECT
        SUM(h.units * COALESCE(ln.nav, h.avg_nav))      AS total_value,
        SUM(h.total_invested)                            AS total_invested,
        COUNT(DISTINCT h.scheme_code)                    AS scheme_count
    FROM holdings h
    LEFT JOIN LATERAL (
        SELECT nav FROM nav_history nh
        WHERE nh.scheme_code = h.scheme_code
        ORDER BY nh.nav_date DESC LIMIT 1
    ) ln ON true
    WHERE h.tenant_id = $tenant_id AND h.client_id = c.id AND h.units > 0
) ps ON true
LEFT JOIN LATERAL (
    SELECT
        COUNT(*)                                         AS total_goals,
        COUNT(*) FILTER (WHERE g.probability >= 0.7)     AS on_track,
        COUNT(*) FILTER (WHERE g.probability >= 0.4 AND g.probability < 0.7) AS at_risk,
        COUNT(*) FILTER (WHERE g.probability < 0.4 OR g.probability IS NULL) AS behind
    FROM goals g
    WHERE g.tenant_id = $tenant_id AND g.client_id = c.id AND g.status = 'active'
) gs ON true
WHERE c.tenant_id = $tenant_id
  AND c.id = $client_id;
