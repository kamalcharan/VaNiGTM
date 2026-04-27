/**
 * gtm-analytics-skill: get_activity_feed
 * Recent activity events for the war room.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-activity-feed.sql'), 'utf-8');

interface Params { event_type?: string; campaign_id?: number; limit?: number; }

export async function get_activity_feed(params: Params, ctx: SkillContext) {
  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $event_type:  params.event_type || null,
    $campaign_id: params.campaign_id ?? null,
    $limit:       Math.min(params.limit ?? 50, 200),
  });
  return { events: res.rows, recipe: 'activity-feed' as const };
}
