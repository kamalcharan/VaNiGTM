/**
 * gtm-analytics-skill: get_conversion_funnel
 * Pipeline funnel stage distribution.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-conversion-funnel.sql'), 'utf-8');

export async function get_conversion_funnel(params: { campaign_id?: number }, ctx: SkillContext) {
  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id ?? null,
  });
  const total = res.rows.reduce((sum: number, r: { count: number }) => sum + Number(r.count), 0);
  return { stages: res.rows, total, recipe: 'conversion-funnel' as const };
}
