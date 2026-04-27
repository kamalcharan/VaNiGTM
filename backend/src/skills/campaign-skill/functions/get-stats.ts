/**
 * campaign-skill: get_stats
 * Summary stats for the campaigns dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_STATS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-stats.sql'), 'utf-8'
);

interface StatsResult {
  total: number;
  draft: number;
  active: number;
  paused: number;
  completed: number;
  recipe: 'stat-summary';
}

export async function get_stats(
  _params: Record<string, never>,
  ctx: SkillContext
): Promise<StatsResult> {
  const res = await ctx.db.query<{
    total: number; draft: number; active: number; paused: number; completed: number;
  }>(GET_STATS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
  });

  const row = res.rows[0] ?? { total: 0, draft: 0, active: 0, paused: 0, completed: 0 };

  return { ...row, recipe: 'stat-summary' };
}
