/**
 * ingestion-skill: delete_source — removes the source row only. gt_kg_nodes
 * survives on purpose: the tenant may have confirmed or edited what was
 * learned, and knowledge outlives the document it came from.
 */
import { SkillContext } from '../../../shared/types';

export async function delete_source(params: { source_id: string }, ctx: SkillContext) {
  const sourceId = String(params.source_id ?? '').trim();
  if (!sourceId) throw new Error('MISSING_FIELDS: source_id is required');
  const deleted = await ctx.db.transaction(async (tx) => {
    const r = await tx.query<{ id: string }>(
      `DELETE FROM gt_kb_sources WHERE id = $source_id AND tenant_id = $tenant_id RETURNING id`,
      { source_id: sourceId, tenant_id: ctx.tenant_id },
    );
    return r.rows.length;
  });
  if (deleted === 0) throw new Error('SOURCE_NOT_FOUND: No source with that id for this tenant');
  return { deleted: true, source_id: sourceId, recipe: 'confirmation' };
}
