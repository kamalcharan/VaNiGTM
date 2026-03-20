-- KI-29: All financial goals for a client
-- MUST filter by tenant_id for multi-tenant isolation

SELECT
    g.id,
    g.name,
    g.goal_type       AS type,
    g.target_amount,
    g.target_date,
    g.current_corpus,
    g.monthly_sip,
    g.inflation_rate,
    g.expected_return,
    g.probability,
    g.status,
    g.linked_schemes,
    g.notes,
    g.created_at,
    g.updated_at
FROM ki_goals g
WHERE g.tenant_id = $tenant_id
  AND g.client_id = $client_id
ORDER BY g.status ASC, g.target_date ASC;
