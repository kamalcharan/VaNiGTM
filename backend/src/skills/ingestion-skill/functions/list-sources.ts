/**
 * ingestion-skill: list_sources — what VaNi has read, newest first.
 * raw_text is omitted (it can be large); get_source carries the run steps.
 */
import { SkillContext } from '../../../shared/types';
import { SQL_GET_SOURCES } from './_sources';

interface ListSourcesParams { limit?: number; offset?: number; }

export async function list_sources(params: ListSourcesParams, ctx: SkillContext) {
  const limit = Math.min(Math.max(Number(params.limit ?? 50) || 50, 1), 100);
  const offset = Math.max(Number(params.offset ?? 0) || 0, 0);
  const result = await ctx.db.query(SQL_GET_SOURCES, { tenant_id: ctx.tenant_id, limit, offset });
  return { sources: result.rows, total: result.rows.length, recipe: 'source-list' };
}
