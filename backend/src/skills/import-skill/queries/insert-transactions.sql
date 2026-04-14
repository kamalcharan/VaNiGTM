-- KI-30: Insert imported transactions with dedup
-- Uses ON CONFLICT DO NOTHING on (tenant_id, client_id, scheme_code, txn_date, amount, units)
-- MUST be called inside a BEGIN/COMMIT transaction block

INSERT INTO ki_transactions (
    tenant_id, client_id, scheme_code, txn_date,
    txn_type, txn_type_id,
    amount, units, nav,
    folio_no, fund_name, category,
    tds, euin, arn, sip_reg_date,
    description, source, source_ref,
    is_live
)
VALUES (
    $tenant_id, $client_id, $scheme_code, $txn_date,
    $txn_type, $txn_type_id,
    $amount, $units, $nav,
    $folio_no, $fund_name, $category,
    $tds, $euin, $arn, $sip_reg_date,
    $description, $source, $source_ref,
    $is_live
)
ON CONFLICT (tenant_id, client_id, scheme_code, txn_date, amount, units)
WHERE source != 'manual'
DO NOTHING
RETURNING id;
