-- KI-28: All active schemes in a category with NAV at two points
-- Used to calculate period returns for ranking
-- Shared table — no tenant_id filter needed

SELECT
    s.scheme_code,
    s.scheme_name,
    current_nav.nav   AS nav_current,
    period_nav.nav    AS nav_period_start
FROM ki_schemes s
LEFT JOIN LATERAL (
    SELECT nav
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) current_nav ON true
LEFT JOIN LATERAL (
    SELECT nav
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
      AND nh.nav_date <= $period_start_date
    ORDER BY nh.nav_date DESC
    LIMIT 1
) period_nav ON true
WHERE s.category = $category
  AND s.active = true;
