/**
 * gtm-analytics-skill: get_dashboard_stats
 * Top-level KPI summary across all active campaigns.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-dashboard-stats.sql'), 'utf-8');

export async function get_dashboard_stats(_params: Record<string, never>, ctx: SkillContext) {
  const res = await ctx.db.query(SQL, { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live });
  const row = res.rows[0] ?? {
    total_contacts: 0, total_engaged: 0, reply_rate_pct: 0, meetings_booked: 0,
    active_campaigns: 0, active_sequences: 0, recent_agent_runs: 0,
  };
  return { ...row, recipe: 'war-room' as const };
}
