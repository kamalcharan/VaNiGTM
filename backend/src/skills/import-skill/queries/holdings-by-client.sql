-- KI-30: Fetch current holdings for reconciliation
-- Returns all holdings for a client with scheme details

SELECT
    h.id AS holding_id,
    h.scheme_code,
    s.scheme_name,
    h.units,
    h.total_invested,
    h.current_value
FROM ki_holdings h
LEFT JOIN ki_schemes s ON s.scheme_code = h.scheme_code
WHERE h.tenant_id = $tenant_id
  AND h.client_id = $client_id
  AND h.units > 0
ORDER BY h.scheme_code;
