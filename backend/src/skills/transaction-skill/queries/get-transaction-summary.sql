-- get-transaction-summary: aggregated stats for a given filter scope + period
-- Named params: $tenant_id, $is_live, $client_id (nullable), $date_from (nullable), $date_to (nullable)

SELECT
    -- Inflows: purchases + SIPs
    COALESCE(SUM(
        CASE WHEN t.txn_type IN ('PURCHASE', 'SIP', 'STP IN', 'SWITCH IN')
             THEN t.amount ELSE 0 END
    ), 0)::numeric(18,2)                                   AS total_invested,

    -- Outflows: redemptions + SWPs + dividends paid out
    COALESCE(SUM(
        CASE WHEN t.txn_type IN ('REDEMPTION', 'SWP', 'DIVIDEND PAYOUT', 'STP OUT', 'SWITCH OUT')
             THEN t.amount ELSE 0 END
    ), 0)::numeric(18,2)                                   AS total_redeemed,

    -- Net flow (positive = net investment, negative = net withdrawal)
    COALESCE(SUM(
        CASE
            WHEN t.txn_type IN ('PURCHASE', 'SIP', 'STP IN', 'SWITCH IN')  THEN  t.amount
            WHEN t.txn_type IN ('REDEMPTION', 'SWP', 'DIVIDEND PAYOUT', 'STP OUT', 'SWITCH OUT') THEN -t.amount
            ELSE 0
        END
    ), 0)::numeric(18,2)                                   AS net_flow,

    COUNT(*)                                               AS total_count,
    COUNT(DISTINCT t.client_id)                            AS client_count,
    COUNT(DISTINCT t.scheme_code)                          AS scheme_count,
    MIN(t.txn_date)                                        AS earliest_date,
    MAX(t.txn_date)                                        AS latest_date,

    -- Duplicate flag count (for data quality indicator)
    COUNT(*) FILTER (WHERE t.is_potential_duplicate = true) AS duplicate_count

FROM ki_transactions t

WHERE t.tenant_id = $tenant_id
  AND t.is_live   = $is_live
  AND ($client_id::integer IS NULL OR t.client_id = $client_id::integer)
  AND ($date_from::date IS NULL OR t.txn_date >= $date_from::date)
  AND ($date_to::date IS NULL OR t.txn_date <= $date_to::date);
