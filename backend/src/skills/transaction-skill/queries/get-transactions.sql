-- get-transactions: paginated transaction list, cross-client or single-client
-- Named params: $tenant_id, $is_live, $client_id (nullable), $txn_type (nullable),
--               $date_from (nullable), $date_to (nullable), $search (nullable),
--               $is_duplicate_only (nullable bool), $portfolio_flag_excluded (nullable bool),
--               $ext_ref_id_search (nullable text — iwell/ext_ref ILIKE match),
--               $limit, $offset
--
-- NOTE: import_session_id filter added by migration 049 — enabled in get-transactions.ts
--       after that migration is applied (column check at boot).
--
-- ORDER BY is injected dynamically in get-transactions.ts (safe whitelist).

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
    NULL::integer AS import_session_id,  -- populated after migration 049 is applied
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
  AND ($portfolio_flag_excluded::boolean IS NULL
       OR $portfolio_flag_excluded::boolean = false
       OR t.portfolio_flag = false)
  AND ($ext_ref_id_search::text IS NULL
       OR cl.ext_ref_id ILIKE '%' || $ext_ref_id_search::text || '%')
  -- import_session_id filter: uncomment after running migration 049
  -- AND ($import_session_id::integer IS NULL
  --      OR t.import_session_id = $import_session_id::integer)

/* ORDER_BY_PLACEHOLDER */
LIMIT  $limit
OFFSET $offset;
