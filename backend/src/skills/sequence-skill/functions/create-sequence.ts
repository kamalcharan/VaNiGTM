/**
 * sequence-skill: create_sequence
 * Create a new sequence for a campaign.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-sequence.sql'), 'utf-8');

interface CreateSequenceParams { campaign_id: number; name: string; description?: string; }

export async function create_sequence(params: CreateSequenceParams, ctx: SkillContext) {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  if (!params.name?.trim()) throw new Error('Sequence name is required');

  const result = await ctx.db.transaction(async (tx) => {
    // Verify campaign exists
    const check = await tx.query(
      `SELECT id FROM gt_campaigns WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id }
    );
    if (!check.rows[0]) throw new Error('Campaign not found');

    const res = await tx.query(SQL, {
      $campaign_id: params.campaign_id,
      $tenant_id:   ctx.tenant_id,
      $is_live:     ctx.is_live,
      $name:        params.name.trim(),
      $description: params.description?.trim() || null,
      $created_by:  ctx.user_id,
    });
    return res.rows[0];
  });
  return { sequence: result, recipe: 'sequence-card' as const };
}
