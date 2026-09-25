-- What VaNi knows: every node in the tenant's knowledge graph, with the
-- source that produced it where one is linked (gt_kb_sources.source_run_id
-- = gt_kg_nodes.source_run_id). Conversation-written nodes carry no source.
--
-- Named params: $tenant_id, $label, $limit, $offset

SELECT
  n.id,
  n.label,
  n.name,
  n.description,
  n.properties,
  n.updated_at,
  s.id            AS source_id,
  s.display_name  AS source_name,
  s.source_type   AS source_type,
  COUNT(*) OVER () AS filtered_total
FROM gt_kg_nodes n
LEFT JOIN gt_kb_sources s
       ON s.source_run_id = n.source_run_id
      AND s.tenant_id = n.tenant_id
WHERE n.tenant_id = $tenant_id
  AND ($label::text IS NULL OR n.label = $label::text)
ORDER BY n.label, n.updated_at DESC, n.name
LIMIT $limit OFFSET $offset;
