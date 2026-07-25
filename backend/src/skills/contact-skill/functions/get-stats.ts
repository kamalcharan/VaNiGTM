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
  high_fit_contacts: number;
  distinct_companies: number;
  recipe: 'stat-summary';
}

export async function get_stats(
  _params: Record<string, never>,
  ctx: SkillContext
): Promise<GetStatsResult> {
  const res = await ctx.db.query<{
    total_contacts: string;
    high_fit_contacts: string;
    distinct_companies: string;
  }>(GET_STATS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
  });

  const row = res.rows[0];
  return {
    total_contacts:     Number(row?.total_contacts     ?? 0),
    high_fit_contacts:  Number(row?.high_fit_contacts  ?? 0),
    distinct_companies: Number(row?.distinct_companies ?? 0),
    recipe:             'stat-summary',
  };
}
