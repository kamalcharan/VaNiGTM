-- KI: Create a new asset assignment for a client
-- Named params: $tenant_id, $is_live, $client_id, $asset_type_id,
--   $scheme_code (nullable), $investment_type, $principal_amount,
--   $start_date (nullable), $duration_months (nullable),
--   $recurring_amount (nullable), $investment_frequency (nullable),
--   $custom_assumption_rate (nullable), $notes (nullable)

INSERT INTO ki_customer_asset_assignments (
    tenant_id,
    is_live,
    client_id,
    asset_type_id,
    scheme_code,
    investment_type,
    principal_amount,
    start_date,
    duration_months,
    recurring_amount,
    investment_frequency,
    custom_assumption_rate,
    notes,
    is_active,
    created_at,
    updated_at
) VALUES (
    $tenant_id,
    $is_live,
    $client_id,
    $asset_type_id,
    $scheme_code,
    $investment_type,
    $principal_amount,
    $start_date,
    $duration_months,
    $recurring_amount,
    $investment_frequency,
    $custom_assumption_rate,
    $notes,
    true,
    NOW(),
    NOW()
)
RETURNING
    id              AS assignment_id,
    created_at;
