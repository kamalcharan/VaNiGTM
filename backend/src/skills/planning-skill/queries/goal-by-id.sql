-- KI-29: Single goal by ID with tenant isolation
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
  AND g.id = $goal_id;
