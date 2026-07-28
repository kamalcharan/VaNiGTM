/**
 * prospect-skill: get_prospect_stats
 *
 * The health of the imported set. Reports fill rate and validity as SEPARATE
 * numbers and never blends them into one score — the provider CSV profiled
 * for this design read 100% populated on revenue while 60 of 119 values were
 * the literal string 'undefined+'. One number would have called that data
 * perfect.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const STATS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/prospect-stats.sql'), 'utf-8',
);

interface ProspectStats {
  total: number;
  customers: number;
  prospects: number;
  avg_completeness: string | null;
  avg_validity: string | null;
  with_rejected_fields: number;
  with_domain: number;
  undated: number;
  fresh: number;
  stale: number;
  sharing_domain: number;
  sharing_name: number;
}

interface GetProspectStatsResult {
  stats: ProspectStats;
  recipe: 'prospect-stats';
}

export async function get_prospect_stats(
  _params: Record<string, never>,
  ctx: SkillContext,
): Promise<GetProspectStatsResult> {
  const res = await ctx.db.query<ProspectStats>(STATS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
  });

  const empty: ProspectStats = {
    total: 0, customers: 0, prospects: 0,
    avg_completeness: null, avg_validity: null, with_rejected_fields: 0,
    with_domain: 0, undated: 0, fresh: 0, stale: 0,
    sharing_domain: 0, sharing_name: 0,
  };

  return { stats: res.rows[0] ?? empty, recipe: 'prospect-stats' };
}
