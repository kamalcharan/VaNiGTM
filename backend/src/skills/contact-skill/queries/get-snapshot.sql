-- get-snapshot: full financial snapshot for a contact
-- Named params: $tenant_id, $is_live, $contact_id

SELECT
    s.id,
    s.contact_id,
    s.risk_profile,
    s.net_worth_estimate,
    s.annual_income_estimate,
    s.investment_horizon_years,
    s.existing_mf_breakdown,
    s.goals_lite,
    s.notes,
    s.created_at,
    s.updated_at
FROM ki_contact_snapshot s
JOIN ki_contacts c ON c.id = s.contact_id
WHERE s.contact_id = $contact_id
  AND s.is_live    = $is_live
  AND c.tenant_id  = $tenant_id;
