/**
 * contact-skill: assign_to_campaign
 * Assign one or more contacts to a campaign. Idempotent (skips already assigned).
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const ASSIGN_SQL = fs.readFileSync(path.join(__dirname, '../queries/assign-to-campaign.sql'), 'utf-8');

interface AssignParams {
  campaign_id: number;
  contact_ids: number[];
}

export async function assign_to_campaign(params: AssignParams, ctx: SkillContext) {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  if (!Array.isArray(params.contact_ids) || params.contact_ids.length === 0) {
    throw new Error('contact_ids array is required');
  }

  const assigned: number[] = [];

  await ctx.db.transaction(async (tx) => {
    // Verify campaign exists
    const check = await tx.query(
      `SELECT id FROM gt_campaigns WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id }
    );
    if (!check.rows[0]) throw new Error('Campaign not found');

    for (const contactId of params.contact_ids) {
      const res = await tx.query<{ id: number }>(ASSIGN_SQL, {
        $contact_id:  contactId,
        $campaign_id: params.campaign_id,
        $tenant_id:   ctx.tenant_id,
        $is_live:     ctx.is_live,
      });
      if (res.rows[0]) assigned.push(contactId);

      // Log initial stage
      if (res.rows[0]) {
        await tx.query(
          `INSERT INTO gt_stage_log (assignment_id, tenant_id, is_live, to_stage, trigger_type, created_by)
           VALUES ($assignment_id, $tenant_id, $is_live, 'identified', 'manual', $user_id)`,
          { $assignment_id: res.rows[0].id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $user_id: ctx.user_id }
        );
      }
    }
  });

  return { assigned_count: assigned.length, contact_ids: assigned, recipe: 'confirmation' as const };
}
