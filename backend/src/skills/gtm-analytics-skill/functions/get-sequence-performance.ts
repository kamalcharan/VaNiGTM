/**
 * gtm-analytics-skill: get_sequence_performance
 * All sequences with performance stats.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-sequence-performance.sql'), 'utf-8');

export async function get_sequence_performance(params: { campaign_id?: number }, ctx: SkillContext) {
  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id ?? null,
  });
  return { sequences: res.rows, recipe: 'sequence-table' as const };
}
