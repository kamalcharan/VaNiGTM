/**
 * pool-skill: stop_enrich_run — stop a run between two companies (tab 3). A
 * queued run never starts; a running one finishes the company it is reading
 * and stops, releasing the rest from today's records. What it wrote stays
 * until withdrawn.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { EnrichError, stopRun } from '../../../etl/pool-enrich';
import { requireAdmin } from '../shared';

export async function stop_enrich_run(params: { event_id: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const id = String(params.event_id ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('event_id is required.');
  try {
    return await stopRun(getPool(), id, ctx.user_id);
  } catch (e) {
    if (e instanceof EnrichError) throw new Error(`${e.code}: ${e.message}`);
    throw e;
  }
}
