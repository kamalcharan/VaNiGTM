/** pool-skill: company — one company in full: the Complete test, every field's source, every source row. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql } from '../shared';

export async function company(params: { company_id: string | number }, ctx: SkillContext) {
  requireAdmin(ctx);
  const id = Number(params.company_id);
  if (!Number.isInteger(id)) throw new Error('company_id is required.');
  const c = (await ctx.db.query<any>(sql('company'), { $company_id: id })).rows[0];
  if (!c) return { company: null, sources: [], reason: 'NOT_FOUND' as const };
  const s = await ctx.db.query<any>(sql('company-sources'), { $company_id: id });
  return {
    company: c,
    sources: s.rows.map((x) => ({ ...x, is_decision: Boolean(x.raw?.decision), tier: Number(x.tier) })),
  };
}
