/** pool-skill: deliveries — each common-pool delivery with its rows counted by state. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql } from '../shared';

const N = ['staged', 'staged_junk', 'staged_held', 'source_rows', 'unmatched', 'complete', 'waiting', 'held', 'junk', 'duplicates'];

export async function deliveries(params: { source_code?: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const r = await ctx.db.query<any>(sql('deliveries'), { $source_code: params.source_code || null });
  return {
    deliveries: r.rows.map((x) => {
      const out: Record<string, unknown> = { ...x, id: String(x.id) };
      for (const k of N) out[k] = Number(x[k]);
      return out;
    }),
  };
}
