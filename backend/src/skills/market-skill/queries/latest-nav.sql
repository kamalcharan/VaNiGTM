-- KI-28: Latest NAV for a scheme with scheme details
-- Shared table — no tenant_id filter needed

SELECT
    s.scheme_code,
    s.scheme_name,
    s.amc,
    s.category,
    s.expense_ratio,
    s.risk_grade,
    s.aum_cr,
    ln.nav,
    ln.nav_date
FROM ki_schemes s
LEFT JOIN LATERAL (
    SELECT nav, nav_date
    FROM ki_nav_history nh
    WHERE nh.scheme_code = s.scheme_code
    ORDER BY nh.nav_date DESC
    LIMIT 1
) ln ON true
WHERE s.scheme_code = $scheme_code;
