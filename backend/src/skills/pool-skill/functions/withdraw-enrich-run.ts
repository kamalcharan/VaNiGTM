/**
 * pool-skill: withdraw_enrich_run — take back everything one run wrote
 * (prototype tab 4): its two enrichment loads are retired, every company it
 * touched is re-derived, re-tested and re-scored, and its graph facts go
 * unless another run also found them. Delivered data is untouched; the run
 * stays in the history, marked withdrawn.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { EnrichError, withdrawRun } from '../../../etl/pool-enrich';
import { requireAdmin } from '../shared';

export async function withdraw_enrich_run(params: { event_id: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const id = String(params.event_id ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('event_id is required.');
  try {
    return await withdrawRun(getPool(), id, ctx.user_id);
  } catch (e) {
    if (e instanceof EnrichError) throw new Error(`${e.code}: ${e.message}`);
    throw e;
  }
}
