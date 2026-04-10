-- get-snapshot-header: fetch a specific snapshot version for a contact
-- Pass $status = 'active' for current, 'draft' for WIP
-- Named params: $tenant_id, $contact_id, $is_live, $status

SELECT
    s.id,
    s.contact_id,
    s.version_number,
    s.status,
    s.risk_profile,
    s.notes,
    s.created_by_user_id,
    s.intake_token_id,
    s.calc_monthly_income,
    s.calc_monthly_expenses,
    s.calc_monthly_savings,
    s.calc_savings_rate_pct,
    s.calc_total_assets,
    s.calc_total_liabilities,
    s.calc_net_worth,
    s.calc_total_emi,
    s.calc_dti_pct,
    s.calc_liquid_assets,
    s.calc_liquidity_months,
    s.submitted_at,
    s.created_at,
    s.updated_at,
    u.name  AS created_by_name
FROM ki_contact_snapshots s
LEFT JOIN vn_users u ON u.id = s.created_by_user_id
WHERE s.contact_id = $contact_id
  AND s.tenant_id  = $tenant_id
  AND s.is_live    = $is_live
  AND s.status     = $status;
