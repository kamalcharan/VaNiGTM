/**
 * pool-skill: enrich_run — one enrichment run (prototype tabs 3 and 4): live
 * progress, the feed, before and now, then what it did — by part, models,
 * what was not read and why, and whether it was withdrawn.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { runView } from '../../../etl/pool-enrich-views';
import { requireAdmin } from '../shared';

export async function enrich_run(params: { event_id: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const id = String(params.event_id ?? '').trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('event_id is required.');
  const run = await runView(getPool(), ctx.tenant_id, id);
  return run ? { run } : { run: null, reason: 'NOT_FOUND' as const };
}
