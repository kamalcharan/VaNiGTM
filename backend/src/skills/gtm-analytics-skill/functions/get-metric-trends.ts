/**
 * gtm-analytics-skill: get_metric_trends
 * Time-series metrics for trend charts.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-metric-trends.sql'), 'utf-8');

interface Params { campaign_id: number; period?: string; days?: number; }

export async function get_metric_trends(params: Params, ctx: SkillContext) {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  const period = params.period === 'weekly' ? 'weekly' : 'daily';

  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id,
    $period:      period,
    $days:        params.days ?? 30,
  });
  return { points: res.rows, recipe: 'metric-trends' as const };
}
