-- get-transaction-summary: aggregated stats for a given filter scope + period
-- Named params: $tenant_id, $is_live, $client_id (nullable), $date_from (nullable), $date_to (nullable)
--
-- Uses ki_transaction_types.txn_code when txn_type_id is set (new data).
-- Falls back to ki_transactions.txn_type (lowercase: 'purchase','sip','redemption','switch_in','switch_out')
-- for legacy rows where txn_type_id was not yet backfilled.

SELECT
    -- Inflows: money entering MF universe (purchases + SIPs + switch-ins)
    COALESCE(SUM(
        CASE
            WHEN tt.txn_code IN ('PURCHASE','SIP','STP IN','SWITCH IN',
                                  'OPENING BALANCE','SYSTEMATIC TRANSFER IN') THEN t.amount
            WHEN tt.txn_code IS NULL AND t.txn_type IN (
                'purchase','sip','switch_in','dividend_reinvest','opening_balance'
            ) THEN t.amount
            ELSE 0
        END
    ), 0)::numeric(18,2)                                   AS total_invested,

    -- Outflows: money leaving MF universe (redemptions + SWPs)
    COALESCE(SUM(
        CASE
            WHEN tt.txn_code IN ('REDEMPTION','SWP','DIVIDEND PAYOUT',
                                  'STP OUT','SWITCH OUT','SELL',
                                  'SYSTEMATIC TRANSFER OUT') THEN t.amount
            WHEN tt.txn_code IS NULL AND t.txn_type IN (
                'redemption','switch_out','dividend_payout'
            ) THEN t.amount
            ELSE 0
        END
    ), 0)::numeric(18,2)                                   AS total_redeemed,

    -- Net flow (positive = net into MF, negative = net out of MF)
    COALESCE(SUM(
        CASE
            WHEN tt.txn_code IN ('PURCHASE','SIP','STP IN','SWITCH IN',
                                  'OPENING BALANCE','SYSTEMATIC TRANSFER IN') THEN  t.amount
            WHEN tt.txn_code IS NULL AND t.txn_type IN (
                'purchase','sip','switch_in','dividend_reinvest','opening_balance'
            ) THEN  t.amount
            WHEN tt.txn_code IN ('REDEMPTION','SWP','DIVIDEND PAYOUT',
                                  'STP OUT','SWITCH OUT','SELL',
                                  'SYSTEMATIC TRANSFER OUT') THEN -t.amount
            WHEN tt.txn_code IS NULL AND t.txn_type IN (
                'redemption','switch_out','dividend_payout'
            ) THEN -t.amount
            ELSE 0
        END
    ), 0)::numeric(18,2)                                   AS net_flow,

    COUNT(*)                                               AS total_count,
    COUNT(DISTINCT t.client_id)                            AS client_count,
    COUNT(DISTINCT t.scheme_code)                          AS scheme_count,
    MIN(t.txn_date)                                        AS earliest_date,
    MAX(t.txn_date)                                        AS latest_date,

    COUNT(*) FILTER (WHERE t.is_potential_duplicate = true) AS duplicate_count

FROM ki_transactions t
LEFT JOIN ki_transaction_types tt ON tt.id = t.txn_type_id

WHERE t.tenant_id = $tenant_id
  AND t.is_live   = $is_live
  AND ($client_id::integer IS NULL OR t.client_id = $client_id::integer)
  AND ($date_from::date IS NULL OR t.txn_date >= $date_from::date)
  AND ($date_to::date IS NULL OR t.txn_date <= $date_to::date);
