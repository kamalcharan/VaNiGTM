-- Every relationship in the tenant's graph. Both ends are the tenant's own
-- nodes (FK + the tenant filter here); the console joins them to the nodes
-- it is showing.
-- Named params: $tenant_id
SELECT e.id, e.from_node_id, e.to_node_id, e.relationship, e.created_at
FROM gt_kg_edges e
WHERE e.tenant_id = $tenant_id
ORDER BY e.created_at;
