-- KI: Asset assignments for a client — all asset types (MF + non-MF)
-- Named params: $tenant_id, $is_live, $client_id
--
-- Two sources, unified via UNION ALL:
--
--   Part 1 — ki_customer_asset_assignments (explicit plans)
--     Covers: all non-MF manual entries + any MF that was imported after
--     migration 051 or manually added via Add Investment modal.
--     has_assignment = true → edit/delete buttons shown in UI.
--
--   Part 2 — ki_holdings with NO assignment row (historical imports)
--     ki_holdings has no is_live; these rows are surfaced in every
--     environment so portfolio data is always visible.
--     has_assignment = false → edit/delete buttons hidden; read-only.
--
-- This design means no backfill is ever needed: all imported MF data
-- shows up immediately via Part 2, and explicit plans from Part 1
-- take precedence (they are excluded from Part 2 via NOT EXISTS).
--
-- NOTE: alias 'at' avoided — reserved SQL keyword (AT TIME ZONE).

-- ── Part 1: Explicit asset assignment rows ───────────────────────────────
SELECT
    aa.id                                               AS assignment_id,
    true                                                AS has_assignment,
    aa.scheme_code,
    aa.investment_type,
    aa.principal_amount,
    aa.start_date,
    aa.duration_months,
    aa.recurring_amount,
    aa.investment_frequency,
    aa.custom_assumption_rate,
    aa.notes,
    aa.created_at,

    atype.id                                            AS asset_type_id,
    atype.asset_type_code,
    atype.asset_type_name,
    atype.category,
    atype.default_assumption_rate,
    atype.display_order,

    s.scheme_name,
    s.amc,
    s.category                                          AS fund_category,

    h.units,
    h.total_invested                                    AS mf_invested,
    h.avg_nav,

    latest_nav.nav                                      AS current_nav,
    latest_nav.nav_date,

    COALESCE(aa.custom_assumption_rate, atype.default_assumption_rate, 0)
                                                        AS effective_rate,

    GREATEST(
        EXTRACT(EPOCH FROM (NOW() - COALESCE(aa.start_date::TIMESTAMPTZ, aa.created_at))) / (365.25 * 24 * 3600),
        0
    )                                                   AS years_held,

    CASE
        WHEN aa.scheme_code IS NOT NULL AND h.units IS NOT NULL AND h.units > 0
            THEN ROUND(h.units * COALESCE(latest_nav.nav, h.avg_nav), 2)
        WHEN aa.scheme_code IS NULL AND aa.principal_amount IS NOT NULL AND aa.principal_amount > 0
            THEN ROUND(
                aa.principal_amount * POWER(
                    1.0 + COALESCE(aa.custom_assumption_rate, atype.default_assumption_rate, 0) / 100.0,
                    GREATEST(
                        EXTRACT(EPOCH FROM (NOW() - COALESCE(aa.start_date::TIMESTAMPTZ, aa.created_at)))
                            / (365.25 * 24 * 3600),
                        0
                    )
                ),
                2
            )
        ELSE NULL
    END                                                 AS estimated_current_value,

    CASE
        WHEN aa.scheme_code IS NOT NULL AND h.units IS NOT NULL AND h.units > 0
            THEN ROUND((h.units * COALESCE(latest_nav.nav, h.avg_nav)) - h.total_invested, 2)
        ELSE NULL
    END                                                 AS gain_loss,

    CASE
        WHEN aa.scheme_code IS NOT NULL
             AND h.units IS NOT NULL AND h.units > 0
             AND h.total_invested > 0
            THEN ROUND(
                ((h.units * COALESCE(latest_nav.nav, h.avg_nav) - h.total_invested)
                    / h.total_invested) * 100,
                2
            )
        ELSE NULL
    END                                                 AS gain_pct

FROM ki_customer_asset_assignments aa
JOIN ki_asset_types atype ON atype.id = aa.asset_type_id
LEFT JOIN ki_schemes s      ON s.scheme_code = aa.scheme_code
LEFT JOIN ki_holdings h
    ON  h.tenant_id   = aa.tenant_id
    AND h.client_id   = aa.client_id
    AND h.scheme_code = aa.scheme_code
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM   ki_nav_history nh
    WHERE  nh.scheme_code = aa.scheme_code
    ORDER  BY nh.nav_date DESC
    LIMIT  1
) latest_nav ON true

WHERE aa.tenant_id = $tenant_id
  AND aa.is_live   = $is_live
  AND aa.client_id = $client_id
  AND aa.is_active = true

UNION ALL

-- ── Part 2: MF holdings with NO assignment (historical imports) ──────────
SELECT
    NULL                                                AS assignment_id,
    false                                               AS has_assignment,
    h.scheme_code,
    CASE WHEN h.is_sip THEN 'sip' ELSE 'one_time' END  AS investment_type,
    NULL::NUMERIC                                       AS principal_amount,
    NULL::DATE                                          AS start_date,
    NULL::INTEGER                                       AS duration_months,
    h.sip_amount                                        AS recurring_amount,
    CASE WHEN h.is_sip THEN 'monthly' ELSE NULL END     AS investment_frequency,
    NULL::NUMERIC                                       AS custom_assumption_rate,
    NULL::TEXT                                          AS notes,
    h.updated_at                                        AS created_at,

    mf.id                                               AS asset_type_id,
    mf.asset_type_code,
    mf.asset_type_name,
    mf.category,
    mf.default_assumption_rate,
    mf.display_order,

    s.scheme_name,
    s.amc,
    s.category                                          AS fund_category,

    h.units,
    h.total_invested                                    AS mf_invested,
    h.avg_nav,

    latest_nav.nav                                      AS current_nav,
    latest_nav.nav_date,

    mf.default_assumption_rate                          AS effective_rate,
    0                                                   AS years_held,

    CASE
        WHEN h.units > 0
            THEN ROUND(h.units * COALESCE(latest_nav.nav, h.avg_nav), 2)
        ELSE NULL
    END                                                 AS estimated_current_value,

    CASE
        WHEN h.units > 0
            THEN ROUND((h.units * COALESCE(latest_nav.nav, h.avg_nav)) - h.total_invested, 2)
        ELSE NULL
    END                                                 AS gain_loss,

    CASE
        WHEN h.units > 0 AND h.total_invested > 0
            THEN ROUND(
                ((h.units * COALESCE(latest_nav.nav, h.avg_nav) - h.total_invested)
                    / h.total_invested) * 100,
                2
            )
        ELSE NULL
    END                                                 AS gain_pct

FROM ki_holdings h
JOIN ki_asset_types mf ON mf.asset_type_code = 'MF'
LEFT JOIN ki_schemes s ON s.scheme_code = h.scheme_code
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM   ki_nav_history nh
    WHERE  nh.scheme_code = h.scheme_code
    ORDER  BY nh.nav_date DESC
    LIMIT  1
) latest_nav ON true

WHERE h.tenant_id = $tenant_id
  AND h.is_live   = $is_live
  AND h.client_id = $client_id
  AND h.units     > 0
  -- Exclude schemes that already have an explicit assignment in Part 1
  AND NOT EXISTS (
    SELECT 1
    FROM   ki_customer_asset_assignments aa
    WHERE  aa.tenant_id  = $tenant_id
      AND  aa.is_live    = $is_live
      AND  aa.client_id  = $client_id
      AND  aa.scheme_code = h.scheme_code
      AND  aa.is_active  = true
  )

ORDER BY display_order, asset_type_name, scheme_name;
