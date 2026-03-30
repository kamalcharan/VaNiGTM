-- KI-30: Insert imported transactions with dedup
-- Uses ON CONFLICT DO NOTHING on (tenant_id, client_id, scheme_code, txn_date, amount, units)
-- MUST be called inside a BEGIN/COMMIT transaction block

INSERT INTO ki_transactions (
    tenant_id, client_id, scheme_code, txn_date, txn_type,
    amount, units, nav, description, source
)
VALUES (
    $tenant_id, $client_id, $scheme_code, $txn_date, $txn_type,
    $amount, $units, $nav, $description, $source
)
ON CONFLICT (tenant_id, client_id, scheme_code, txn_date, amount, units)
DO NOTHING
RETURNING id;
