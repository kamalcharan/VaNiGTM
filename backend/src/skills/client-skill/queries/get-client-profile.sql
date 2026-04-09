-- get-client-profile: 360-view with portfolio summary and goals summary
-- Named params: $tenant_id, $is_live, $client_id

SELECT
    cl.id,
    cl.client_uid,
    cl.pan_encrypted,
    cl.pan_last4,
    cl.dob,
    cl.occupation,
    cl.annual_income,
    cl.risk_capacity,
    cl.risk_tolerance,
    cl.risk_required,
    cl.risk_overall,
    cl.family_id        AS family_group_id,
    cl.tags,
    cl.notes,
    cl.created_at,
    cl.last_interaction_date AS last_interaction,

    -- Contact
    c.name,
    c.email AS email,

    -- Primary mobile
    (
        SELECT ch.channel_value
        FROM ki_contact_channels ch
        WHERE ch.contact_id = c.id AND ch.is_live = cl.is_live
          AND ch.is_active = true AND ch.channel_type = 'mobile'
        ORDER BY ch.is_primary DESC, ch.created_at ASC
        LIMIT 1
    ) AS phone,

    -- Primary address
    (
        SELECT addr.line1
        FROM ki_client_addresses addr
        WHERE addr.client_id = cl.id AND addr.is_live = cl.is_live
          AND addr.is_active = true AND addr.is_primary = true
        LIMIT 1
    ) AS address,
    (
        SELECT addr.city
        FROM ki_client_addresses addr
        WHERE addr.client_id = cl.id AND addr.is_live = cl.is_live
          AND addr.is_active = true AND addr.is_primary = true
        LIMIT 1
    ) AS city,
    (
        SELECT addr.state
        FROM ki_client_addresses addr
        WHERE addr.client_id = cl.id AND addr.is_live = cl.is_live
          AND addr.is_active = true AND addr.is_primary = true
        LIMIT 1
    ) AS state,

    -- Portfolio summary (from holdings)
    COALESCE(SUM(h.current_value), 0)                     AS portfolio_total_value,
    COALESCE(SUM(h.cost_basis), 0)                        AS portfolio_total_invested,
    COUNT(DISTINCT h.scheme_code) FILTER (WHERE h.id IS NOT NULL) AS portfolio_scheme_count,

    -- Goals summary
    COUNT(g.id) FILTER (WHERE g.status = 'active')                AS goals_total,
    COUNT(g.id) FILTER (WHERE g.status = 'active' AND g.probability >= 0.7) AS goals_on_track,
    COUNT(g.id) FILTER (WHERE g.status = 'active' AND g.probability >= 0.4 AND g.probability < 0.7) AS goals_at_risk,
    COUNT(g.id) FILTER (WHERE g.status = 'active' AND (g.probability IS NULL OR g.probability < 0.4)) AS goals_behind

FROM ki_clients cl
JOIN ki_contacts c ON c.id = cl.contact_id
LEFT JOIN ki_holdings h
       ON h.client_id  = cl.id
      AND h.tenant_id  = cl.tenant_id
      AND h.is_live    = cl.is_live
LEFT JOIN ki_goals g
       ON g.client_id  = cl.id
      AND g.tenant_id  = cl.tenant_id
      AND g.is_live    = cl.is_live

WHERE cl.id        = $client_id
  AND cl.tenant_id = $tenant_id
  AND cl.is_live   = $is_live
  AND cl.is_active = true

GROUP BY
    cl.id, cl.client_uid, cl.pan_encrypted, cl.pan_last4, cl.dob,
    cl.occupation, cl.annual_income, cl.risk_capacity, cl.risk_tolerance,
    cl.risk_required, cl.risk_overall, cl.family_id, cl.tags, cl.notes,
    cl.created_at, cl.last_interaction_date,
    c.name, c.email;
