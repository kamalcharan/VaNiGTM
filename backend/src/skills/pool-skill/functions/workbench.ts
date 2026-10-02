/**
 * pool-skill: workbench — the enrichment workbench (release 4, prototype tab 1):
 * the pool by level, Qualified or better, websites, today's record limit, the
 * gaps and what fills them, deliveries with their Qualified+ share, runs, and
 * the slice VaNi suggests reading next.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { workbench as read } from '../../../etl/pool-enrich-views';
import { requireAdmin } from '../shared';

export async function workbench(_params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  return read(getPool());
}
