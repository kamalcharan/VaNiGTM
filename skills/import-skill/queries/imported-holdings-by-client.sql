-- KI-30: Compute holdings snapshot from imported transactions
-- Aggregates buy/sell transactions to derive current units per scheme

SELECT
    t.scheme_code,
    s.scheme_name,
    SUM(CASE WHEN t.txn_type IN ('purchase', 'sip', 'switch_in', 'dividend_reinvest')
             THEN t.units ELSE 0 END)
    - SUM(CASE WHEN t.txn_type IN ('redemption', 'switch_out')
              THEN t.units ELSE 0 END) AS computed_units,
    SUM(CASE WHEN t.txn_type IN ('purchase', 'sip', 'switch_in', 'dividend_reinvest')
             THEN t.amount ELSE 0 END)
    - SUM(CASE WHEN t.txn_type IN ('redemption', 'switch_out')
              THEN t.amount ELSE 0 END) AS net_invested
FROM ki_transactions t
LEFT JOIN ki_schemes s ON s.scheme_code = t.scheme_code
WHERE t.tenant_id = $tenant_id
  AND t.client_id = $client_id
  AND t.source IN ('investwell', 'cas', 'nse')
GROUP BY t.scheme_code, s.scheme_name
HAVING computed_units > 0.001
ORDER BY t.scheme_code;
