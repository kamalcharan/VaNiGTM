-- KI-30: Upsert holdings after import
-- Updates units and current_value if holding exists, otherwise inserts
-- MUST be called inside a BEGIN/COMMIT transaction block

INSERT INTO ki_holdings (
    tenant_id, client_id, scheme_code, units,
    total_invested, current_value
)
VALUES (
    $tenant_id, $client_id, $scheme_code, $units,
    $total_invested, $current_value
)
ON CONFLICT (tenant_id, client_id, scheme_code)
DO UPDATE SET
    units = $units,
    total_invested = $total_invested,
    current_value = $current_value,
    updated_at = CURRENT_TIMESTAMP
RETURNING id;
