-- Node counts per label — the shape of what VaNi knows, in one row per kind.
-- Named params: $tenant_id
SELECT label, COUNT(*)::int AS count
FROM gt_kg_nodes
WHERE tenant_id = $tenant_id
GROUP BY label
ORDER BY count DESC, label;
