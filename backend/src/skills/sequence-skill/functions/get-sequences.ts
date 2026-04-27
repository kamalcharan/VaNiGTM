/**
 * sequence-skill: get_sequences
 * List sequences for a campaign.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/get-sequences.sql'), 'utf-8');

export async function get_sequences(params: { campaign_id: number }, ctx: SkillContext) {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  const res = await ctx.db.query(SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id,
  });
  return { sequences: res.rows, recipe: 'sequence-list' as const };
}
