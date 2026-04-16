-- KI: Asset assignments for a client — all asset types (MF + non-MF)
-- Named params: $tenant_id, $is_live, $client_id
--
-- MF rows:  joined to ki_holdings (units, invested) + lateral NAV for current value
-- Non-MF:   estimated value from principal × compound growth (rate from override or asset type default)
--
-- Returns one row per ki_customer_asset_assignments entry, ordered by
-- asset category display order then scheme name.

SELECT
    aa.id                                           AS assignment_id,
    aa.scheme_code,
    aa.investment_type,
    aa.principal_amount,
    aa.start_date,
    aa.duration_months,
    aa.recurring_amount,
    aa.investment_frequency,
    aa.custom_assumption_rate,
    aa.is_active,
    aa.notes,
    aa.created_at,

    -- Asset type
    at.id                                           AS asset_type_id,
    at.asset_type_code,
    at.asset_type_name,
    at.category,
    at.default_assumption_rate,
    at.display_order,

    -- Scheme info (MF only — NULL for non-MF)
    s.scheme_name,
    s.amc,
    s.category                                      AS fund_category,

    -- Holdings (MF only — computed from transactions by import RPC)
    h.units,
    h.total_invested                                AS mf_invested,
    h.avg_nav,

    -- Latest NAV (MF only — lateral join on ki_nav_history)
    latest_nav.nav                                  AS current_nav,
    latest_nav.nav_date,

    -- Effective growth rate (custom override takes priority)
    COALESCE(aa.custom_assumption_rate, at.default_assumption_rate, 0)
                                                    AS effective_rate,

    -- Years since start (for non-MF compound growth estimate)
    GREATEST(
        EXTRACT(EPOCH FROM (NOW() - COALESCE(aa.start_date, aa.created_at))) / (365.25 * 24 * 3600),
        0
    )                                               AS years_held,

    -- Estimated current value
    CASE
        -- MF: units × latest NAV (fall back to avg_nav if no NAV history)
        WHEN aa.scheme_code IS NOT NULL AND h.units IS NOT NULL AND h.units > 0 THEN
            ROUND(h.units * COALESCE(latest_nav.nav, h.avg_nav), 2)
        -- Non-MF: principal × (1 + rate/100)^years (compound growth)
        WHEN aa.scheme_code IS NULL AND aa.principal_amount IS NOT NULL AND aa.principal_amount > 0 THEN
            ROUND(
                aa.principal_amount * POWER(
                    1.0 + COALESCE(aa.custom_assumption_rate, at.default_assumption_rate, 0) / 100.0,
                    GREATEST(
                        EXTRACT(EPOCH FROM (NOW() - COALESCE(aa.start_date, aa.created_at)))
                            / (365.25 * 24 * 3600),
                        0
                    )
                ),
                2
            )
        ELSE NULL
    END                                             AS estimated_current_value,

    -- Gain / loss (MF only — based on live holdings data)
    CASE
        WHEN aa.scheme_code IS NOT NULL AND h.units IS NOT NULL AND h.units > 0 THEN
            ROUND(
                (h.units * COALESCE(latest_nav.nav, h.avg_nav)) - h.total_invested,
                2
            )
        ELSE NULL
    END                                             AS gain_loss,

    -- Gain % (MF only)
    CASE
        WHEN aa.scheme_code IS NOT NULL
             AND h.units IS NOT NULL AND h.units > 0
             AND h.total_invested > 0 THEN
            ROUND(
                ((h.units * COALESCE(latest_nav.nav, h.avg_nav) - h.total_invested)
                    / h.total_invested) * 100,
                2
            )
        ELSE NULL
    END                                             AS gain_pct

FROM ki_customer_asset_assignments aa
JOIN ki_asset_types at ON at.id = aa.asset_type_id

-- Scheme details for MF
LEFT JOIN ki_schemes s ON s.scheme_code = aa.scheme_code

-- Holdings for MF (tenant-scoped; no is_live on ki_holdings — holdings are per-client)
LEFT JOIN ki_holdings h
    ON  h.tenant_id   = aa.tenant_id
    AND h.client_id   = aa.client_id
    AND h.scheme_code = aa.scheme_code

-- Latest NAV (MF only)
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM   ki_nav_history nh
    WHERE  nh.scheme_code = aa.scheme_code
    ORDER  BY nh.nav_date DESC
    LIMIT  1
) latest_nav ON aa.scheme_code IS NOT NULL

WHERE aa.tenant_id = $tenant_id
  AND aa.is_live   = $is_live
  AND aa.client_id = $client_id
  AND aa.is_active = true

ORDER BY at.display_order, at.asset_type_name, s.scheme_name;
