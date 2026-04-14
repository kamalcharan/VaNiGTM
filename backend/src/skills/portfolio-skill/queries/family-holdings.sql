-- family-holdings: Aggregate holdings across all active members of a family
-- Consolidates by scheme_code — sums units and invested, uses latest NAV.
-- Includes per-member attribution as a JSON array.
-- Named params: $tenant_id, $is_live, $family_id

SELECT
    h.scheme_code,
    s.scheme_name,
    s.category,
    s.amc,

    -- Aggregate units and invested across all family members
    SUM(h.units)                    AS units,
    SUM(h.total_invested)           AS total_invested,

    -- Weighted average NAV
    CASE WHEN SUM(h.units) > 0
         THEN ROUND(SUM(h.units * h.avg_nav) / SUM(h.units), 4)
         ELSE 0
    END                             AS avg_nav,

    -- Latest NAV from nav history
    latest_nav.nav                  AS current_nav,
    latest_nav.nav_date,

    -- Current value and gain/loss based on aggregated units
    ROUND(SUM(h.units) * COALESCE(latest_nav.nav, 0), 2)                               AS current_value,
    ROUND(SUM(h.units) * COALESCE(latest_nav.nav, 0) - SUM(h.total_invested), 2)       AS gain_loss,

    CASE
        WHEN SUM(h.total_invested) > 0
        THEN ROUND(
               ((SUM(h.units) * COALESCE(latest_nav.nav, 0) - SUM(h.total_invested))
                 / SUM(h.total_invested)) * 100,
               2)
        ELSE 0
    END                             AS gain_pct,

    -- Which family members hold this scheme (for attribution display)
    JSON_AGG(
        JSON_BUILD_OBJECT(
            'client_id', h.client_id,
            'name',      ct.name,
            'prefix',    ct.prefix,
            'units',     h.units,
            'invested',  h.total_invested
        ) ORDER BY ct.name
    )                               AS members_holding

FROM ki_holdings h
JOIN ki_clients cl ON cl.id = h.client_id
JOIN ki_contacts ct ON ct.id = cl.contact_id
JOIN ki_schemes s ON s.scheme_code = h.scheme_code
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM ki_nav_history nh
    WHERE nh.scheme_code = h.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) latest_nav ON true

WHERE h.tenant_id  = $tenant_id
  AND h.is_live    = $is_live
  AND h.units      > 0
  AND cl.family_id = $family_id
  AND cl.is_active = true

GROUP BY
    h.scheme_code,
    s.scheme_name,
    s.category,
    s.amc,
    latest_nav.nav,
    latest_nav.nav_date

ORDER BY ROUND(SUM(h.units) * COALESCE(latest_nav.nav, 0), 2) DESC;
