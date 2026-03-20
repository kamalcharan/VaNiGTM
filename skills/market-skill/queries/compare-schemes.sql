-- KI-28: Scheme comparison — fetch scheme details with latest NAV
-- Called once per scheme_code (or use ANY array)
-- Shared table — no tenant_id filter needed

SELECT
    s.scheme_code,
    s.scheme_name,
    s.amc,
    s.category,
    s.expense_ratio,
    s.risk_grade,
    s.aum_cr AS aum,
    ln.nav
FROM schemes s
LEFT JOIN LATERAL (
    SELECT nav
    FROM nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) ln ON true
WHERE s.scheme_code = ANY($scheme_codes)
  AND s.active = true;
