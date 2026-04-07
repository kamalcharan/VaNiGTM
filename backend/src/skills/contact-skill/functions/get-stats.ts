/**
 * contact-skill: get_stats
 * Summary stats for the contacts dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_STATS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-stats.sql'), 'utf-8'
);

interface GetStatsResult {
  total_contacts: number;
  total_clients: number;
  total_prospects: number;
  has_snapshot: number;
  recipe: 'stat-summary';
}

export async function get_stats(
  _params: Record<string, never>,
  ctx: SkillContext
): Promise<GetStatsResult> {
  const res = await ctx.db.query<{
    total_contacts: string;
    total_clients: string;
    total_prospects: string;
    has_snapshot: string;
  }>(GET_STATS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
  });

  const row = res.rows[0];
  return {
    total_contacts:  Number(row?.total_contacts  ?? 0),
    total_clients:   Number(row?.total_clients   ?? 0),
    total_prospects: Number(row?.total_prospects ?? 0),
    has_snapshot:    Number(row?.has_snapshot    ?? 0),
    recipe:          'stat-summary',
  };
}
