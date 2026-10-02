/**
 * pool-skill: start_enrich — start an enrichment run on a slice (prototype tab 2,
 * "Start the run"). Re-checks today's record limit and rebuilds the estimate
 * from the quota left now; the run itself goes to the worker.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { EnrichError, readSlice, startEnrichRun } from '../../../etl/pool-enrich';
import { requireAdmin } from '../shared';

export async function start_enrich(params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  try {
    return await startEnrichRun(getPool(), ctx.tenant_id, ctx.user_id, readSlice(params), Number(params.records));
  } catch (e) {
    if (e instanceof EnrichError) throw new Error(`${e.code}: ${e.message}`);
    throw e;
  }
}
