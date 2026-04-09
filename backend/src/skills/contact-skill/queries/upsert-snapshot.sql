INSERT INTO ki_contact_snapshot
  (contact_id, tenant_id, is_live,
   risk_profile, net_worth_estimate, annual_income_estimate,
   investment_horizon_years, existing_mf_breakdown, goals_lite, notes)
VALUES
  ($contact_id, $tenant_id, $is_live,
   $risk_profile, $net_worth_estimate, $annual_income_estimate,
   $investment_horizon_years, $existing_mf_breakdown, $goals_lite, $notes)
ON CONFLICT (contact_id) DO UPDATE SET
  risk_profile             = COALESCE(EXCLUDED.risk_profile,             ki_contact_snapshot.risk_profile),
  net_worth_estimate       = COALESCE(EXCLUDED.net_worth_estimate,       ki_contact_snapshot.net_worth_estimate),
  annual_income_estimate   = COALESCE(EXCLUDED.annual_income_estimate,   ki_contact_snapshot.annual_income_estimate),
  investment_horizon_years = COALESCE(EXCLUDED.investment_horizon_years, ki_contact_snapshot.investment_horizon_years),
  existing_mf_breakdown    = COALESCE(EXCLUDED.existing_mf_breakdown,    ki_contact_snapshot.existing_mf_breakdown),
  goals_lite               = COALESCE(EXCLUDED.goals_lite,               ki_contact_snapshot.goals_lite),
  notes                    = COALESCE(EXCLUDED.notes,                    ki_contact_snapshot.notes),
  updated_at               = now()
RETURNING id, contact_id, risk_profile, updated_at
