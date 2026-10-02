/**
 * pool-skill: enrich_estimate — a slice and its estimate (prototype tab 2):
 * how many companies match, and for a run of `records` of them the tokens, the
 * companies each model in route HIGH can take on today's quota, and the time.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { countSlice, estimate, readSlice } from '../../../etl/pool-enrich';
import { requireAdmin } from '../shared';

export async function enrich_estimate(params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  const pool = getPool();
  const slice = readSlice(params);
  const matched = await countSlice(pool, slice);
  const asked = Number(params.records ?? 100);
  const records = Math.min(Number.isInteger(asked) && asked > 0 ? asked : 100, matched);
  return { slice, matched, estimate: records > 0 ? await estimate(pool, ctx.tenant_id, records) : null };
}
