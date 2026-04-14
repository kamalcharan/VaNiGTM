-- get-transactions: paginated transaction list, cross-client or single-client
-- Named params: $tenant_id, $is_live, $client_id (nullable), $txn_type (nullable),
--               $date_from (nullable), $date_to (nullable), $search (nullable),
--               $is_duplicate_only (nullable bool), $limit, $offset
--
-- ki_transaction_types columns: id, txn_code, txn_name, txn_type ('Addition'|'Deduction')
-- ki_transactions.txn_type stores lowercase values ('purchase','sip','redemption','switch_in','switch_out')

SELECT
    t.id,
    t.txn_date,
    t.txn_type,
    COALESCE(tt.txn_code,  UPPER(REPLACE(t.txn_type, '_', ' '))) AS txn_type_code,
    COALESCE(tt.txn_name,  t.txn_type)                            AS txn_type_label,
    CASE
        WHEN tt.txn_type = 'Addition'  THEN 'IN'
        WHEN tt.txn_type = 'Deduction' THEN 'OUT'
        -- Fallback for rows where txn_type_id not yet backfilled
        WHEN t.txn_type IN ('purchase','sip','switch_in','dividend_reinvest','opening_balance') THEN 'IN'
        ELSE 'OUT'
    END                                                            AS flow_direction,
    t.amount,
    t.units,
    t.nav,
    t.folio_no,
    t.fund_name,
    t.category,
    t.scheme_code,
    t.stamp_duty,
    t.stt,
    t.tds,
    t.euin,
    t.arn,
    t.sip_reg_date,
    t.source,
    t.description,
    t.is_potential_duplicate,
    t.portfolio_flag,
    t.client_id,
    ct.name                        AS client_name,
    ct.prefix                      AS client_prefix,
    cl.client_no,
    cl.ext_ref_id,

    -- Total count for pagination (no extra round-trip)
    COUNT(*) OVER ()               AS total_count

FROM ki_transactions t
JOIN ki_clients cl      ON cl.id = t.client_id
JOIN ki_contacts ct     ON ct.id = cl.contact_id
LEFT JOIN ki_transaction_types tt ON tt.id = t.txn_type_id

WHERE t.tenant_id  = $tenant_id
  AND t.is_live    = $is_live
  AND ($client_id::integer IS NULL
       OR t.client_id = $client_id::integer)
  AND ($txn_type::text IS NULL
       OR $txn_type::text = 'all'
       OR tt.txn_code = $txn_type::text
       OR UPPER(REPLACE(t.txn_type, '_', ' ')) = $txn_type::text)
  AND ($date_from::date IS NULL
       OR t.txn_date >= $date_from::date)
  AND ($date_to::date IS NULL
       OR t.txn_date <= $date_to::date)
  AND (
      $search::text IS NULL
      OR t.fund_name   ILIKE '%' || $search::text || '%'
      OR t.folio_no    ILIKE '%' || $search::text || '%'
      OR ct.name       ILIKE '%' || $search::text || '%'
      OR t.scheme_code ILIKE '%' || $search::text || '%'
  )
  AND ($is_duplicate_only::boolean IS NULL
       OR $is_duplicate_only::boolean = false
       OR t.is_potential_duplicate = true)

ORDER BY t.txn_date DESC, t.id DESC
LIMIT  $limit
OFFSET $offset;
