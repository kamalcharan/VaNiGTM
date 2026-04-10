/**
 * client-skill: get_stats
 * Summary stats for the clients dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_STATS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-stats.sql'), 'utf-8'
);

interface GetStatsResult {
  total_clients: number;
  active_clients: number;
  pending_onboarding: number;
  bookmarked: number;
  recent_30_days: number;
  family_count: number;
  families_members: number;
  recipe: 'stat-summary';
}

export async function get_stats(
  _params: Record<string, never>,
  ctx: SkillContext
): Promise<GetStatsResult> {
  const res = await ctx.db.query<{
    total_clients: string;
    active_clients: string;
    pending_onboarding: string;
    bookmarked: string;
    recent_30_days: string;
    family_count: string;
    families_members: string;
  }>(GET_STATS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $user_id:   ctx.user_id,
  });

  const row = res.rows[0];
  return {
    total_clients:      Number(row?.total_clients      ?? 0),
    active_clients:     Number(row?.active_clients     ?? 0),
    pending_onboarding: Number(row?.pending_onboarding ?? 0),
    bookmarked:         Number(row?.bookmarked         ?? 0),
    recent_30_days:     Number(row?.recent_30_days     ?? 0),
    family_count:       Number(row?.family_count       ?? 0),
    families_members:   Number(row?.families_members   ?? 0),
    recipe:             'stat-summary',
  };
}
