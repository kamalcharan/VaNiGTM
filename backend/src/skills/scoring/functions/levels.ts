/** scoring: levels — companies by level here, and (admin) in the common pool. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { withTenantClient } from '../../../db';
import { LEVEL_KEYS } from '../../../scoring/score';

const shape = (rows: Array<{ level: string | null; n: number; avg: number | null }>) => {
  const by_level: Record<string, number> = Object.fromEntries(LEVEL_KEYS.map((k) => [k, 0]));
  let total = 0; let unscored = 0; let sum = 0; let scored = 0;
  for (const r of rows) {
    total += Number(r.n);
    if (!r.level) { unscored += Number(r.n); continue; }
    by_level[r.level] = (by_level[r.level] ?? 0) + Number(r.n);
    sum += Number(r.avg ?? 0) * Number(r.n); scored += Number(r.n);
  }
  return { total, by_level, unscored, average: scored ? Math.round(sum / scored) : null };
};

export async function levels(_params: Record<string, unknown>, ctx: SkillContext) {
  const pool = getPool();
  const tenant = await withTenantClient(pool, ctx.tenant_id, async (c) => (await c.query(
    `SELECT score_reasons->>'level' AS level, count(*)::int AS n, avg(score)::float AS avg
       FROM gt_prospects WHERE tenant_id = $1 AND is_active GROUP BY 1`, [ctx.tenant_id])).rows);
  const out: Record<string, unknown> = { tenant: shape(tenant) };
  if (ctx.is_admin) {
    const p = (await pool.query(
      `SELECT coverage_parts->>'level' AS level, count(*)::int AS n, avg(coverage_score)::float AS avg
         FROM gt_universe_companies WHERE merged_into_id IS NULL AND lifecycle_state <> 'junk' GROUP BY 1`)).rows;
    out.pool = shape(p);
  }
  return out;
}
