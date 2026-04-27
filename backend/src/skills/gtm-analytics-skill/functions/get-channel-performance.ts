/**
 * gtm-analytics-skill: get_channel_performance
 * Per-channel send/reply stats.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-channel-performance.sql'), 'utf-8');

interface Params { campaign_id?: number; days?: number; }

export async function get_channel_performance(params: Params, ctx: SkillContext) {
  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id ?? null,
    $days:        params.days ?? 30,
  });
  return { channels: res.rows, recipe: 'channel-comparison' as const };
}
