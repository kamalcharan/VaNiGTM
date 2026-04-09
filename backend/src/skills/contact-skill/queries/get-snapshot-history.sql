-- get-snapshot-history: all snapshot versions for a contact, newest first
-- Named params: $tenant_id, $contact_id, $is_live

SELECT
    s.id,
    s.version_number,
    s.status,
    s.risk_profile,
    s.calc_monthly_income,
    s.calc_net_worth,
    s.calc_savings_rate_pct,
    s.calc_dti_pct,
    s.submitted_at,
    s.created_at,
    u.full_name  AS created_by_name,
    t.token IS NOT NULL AS via_intake_link
FROM ki_contact_snapshots s
LEFT JOIN vn_users u       ON u.id = s.created_by_user_id
LEFT JOIN ki_intake_tokens t ON t.id = s.intake_token_id
WHERE s.contact_id = $contact_id
  AND s.tenant_id  = $tenant_id
  AND s.is_live    = $is_live
ORDER BY s.version_number DESC;
