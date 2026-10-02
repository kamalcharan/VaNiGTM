/** pool-skill: company — one company in full: the Complete test, every field's source (and, since release 4, which run, page and model read it), every source row. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql } from '../shared';
import { provenance } from '../../../etl/pool-enrich-views';

export async function company(params: { company_id: string | number }, ctx: SkillContext) {
  requireAdmin(ctx);
  const id = Number(params.company_id);
  if (!Number.isInteger(id)) throw new Error('company_id is required.');
  const c = (await ctx.db.query<any>(sql('company'), { $company_id: id })).rows[0];
  if (!c) return { company: null, sources: [], reason: 'NOT_FOUND' as const };
  const s = await ctx.db.query<any>(sql('company-sources'), { $company_id: id });
  const sources = s.rows.map((x) => ({ ...x, is_decision: Boolean(x.raw?.decision), tier: Number(x.tier) }));
  // Release 4: where each value came from — a delivery, or an enrichment run's page, model and confidence.
  return { company: c, sources, provenance: provenance(c, sources, c.industry_name ?? null) };
}
