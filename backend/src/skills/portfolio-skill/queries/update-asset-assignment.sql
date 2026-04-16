-- KI: Update an existing asset assignment
-- Named params: $assignment_id, $tenant_id, $is_live, $client_id,
--   $investment_type (nullable), $principal_amount (nullable),
--   $start_date (nullable), $duration_months (nullable — pass NULL to clear),
--   $recurring_amount (nullable), $investment_frequency (nullable),
--   $custom_assumption_rate (nullable — pass NULL to clear/use default),
--   $notes (nullable)

UPDATE ki_customer_asset_assignments
SET
    investment_type        = COALESCE($investment_type,        investment_type),
    principal_amount       = COALESCE($principal_amount,       principal_amount),
    start_date             = COALESCE($start_date::DATE,       start_date),
    duration_months        = $duration_months,
    recurring_amount       = $recurring_amount,
    investment_frequency   = $investment_frequency,
    custom_assumption_rate = $custom_assumption_rate,
    notes                  = COALESCE($notes,                  notes),
    updated_at             = NOW()
WHERE id        = $assignment_id
  AND tenant_id = $tenant_id
  AND is_live   = $is_live
  AND client_id = $client_id
  AND is_active = true
RETURNING
    id          AS assignment_id,
    updated_at;
