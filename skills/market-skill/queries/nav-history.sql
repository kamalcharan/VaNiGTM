-- KI-28: NAV history for a scheme within a date range
-- Shared table — no tenant_id filter needed

SELECT
    nh.nav_date AS date,
    nh.nav
FROM nav_history nh
WHERE nh.scheme_code = $scheme_code
  AND nh.nav_date >= $from_date
  AND nh.nav_date <= $to_date
ORDER BY nh.nav_date ASC;
