/** ingestion-skill: get_source — one source with its processing status and run steps. */
import { SkillContext } from '../../../shared/types';
import { SQL_GET_SOURCE } from './_sources';

export async function get_source(params: { source_id: string }, ctx: SkillContext) {
  const sourceId = String(params.source_id ?? '').trim();
  if (!sourceId) throw new Error('MISSING_FIELDS: source_id is required');
  const result = await ctx.db.query(SQL_GET_SOURCE, { source_id: sourceId, tenant_id: ctx.tenant_id });
  if (result.rows.length === 0) throw new Error('SOURCE_NOT_FOUND: No source with that id for this tenant');
  return { source: result.rows[0], recipe: 'source-detail' };
}
