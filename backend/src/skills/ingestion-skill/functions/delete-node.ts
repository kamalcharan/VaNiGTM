/**
 * ingestion-skill: delete_node — a person removes something VaNi learned
 * wrongly. The edges on it go with it (FK cascade): a relationship to an
 * entry that no longer exists is not a relationship.
 *
 * A re-read of the same page can bring the entry back — the extractor does
 * not know it was removed. That is by design for now: the removal is a
 * correction of the graph, not a rule about the page. If it keeps coming
 * back, the page says it, and the right fix is the page or the prompt.
 */
import { SkillContext } from '../../../shared/types';

export async function delete_node(params: { node_id: string }, ctx: SkillContext) {
  const nodeId = String(params.node_id ?? '').trim();
  if (!nodeId) throw new Error('MISSING_FIELDS: node_id is required');
  return ctx.db.transaction(async (tx) => {
    const edges = await tx.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM gt_kg_edges WHERE tenant_id = $tenant_id AND (from_node_id = $node_id OR to_node_id = $node_id)`,
      { tenant_id: ctx.tenant_id, node_id: nodeId },
    );
    const r = await tx.query<{ id: string }>(
      `DELETE FROM gt_kg_nodes WHERE id = $node_id AND tenant_id = $tenant_id RETURNING id`,
      { node_id: nodeId, tenant_id: ctx.tenant_id },
    );
    if (!r.rows[0]) throw new Error('NODE_NOT_FOUND: No such entry for this tenant');
    return { deleted: true, node_id: nodeId, edges_removed: Number(edges.rows[0]?.n ?? 0), recipe: 'confirmation' as const };
  });
}
