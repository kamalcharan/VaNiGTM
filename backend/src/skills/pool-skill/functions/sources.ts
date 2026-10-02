/** pool-skill: sources — every source, its licence, and what it has given the pool. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql } from '../shared';

export async function sources(_params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  const r = await ctx.db.query<any>(sql('sources'), {});
  const states = await ctx.db.query<{ state: string; n: number }>(sql('pool-states'), {});
  const pool: Record<string, number> = { candidate: 0, enriching: 0, held: 0, complete: 0, junk: 0 };
  for (const s of states.rows) pool[s.state] = Number(s.n);
  return {
    sources: r.rows.map((x) => ({
      ...x,
      deliveries: Number(x.deliveries), retired_deliveries: Number(x.retired_deliveries),
      rows_staged: Number(x.rows_staged), source_rows: Number(x.source_rows), in_pool: Number(x.in_pool),
    })),
    pool,
  };
}
