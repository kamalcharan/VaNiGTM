/**
 * assessment-skill: update_lead_status
 * Moves a lead through the pipeline (new -> contacted -> l2_booked ->
 * engaged -> closed_won/closed_lost). Logs the transition to gt_lead_event
 * so the console timeline shows who changed what, when.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const UPDATE_STATUS_SQL = fs.readFileSync(path.join(__dirname, '../queries/update-lead-status.sql'), 'utf-8');
const VALID_STATUSES = ['new', 'contacted', 'l2_booked', 'engaged', 'closed_won', 'closed_lost'];

interface UpdateLeadStatusParams {
  lead_id: string;
  status: string;
}

export async function update_lead_status(params: UpdateLeadStatusParams, ctx: SkillContext) {
  if (!params.lead_id) throw new Error('lead_id is required');
  if (!VALID_STATUSES.includes(params.status)) {
    throw new Error(`status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  const access = await resolvePartnerContext(ctx);

  const result = await ctx.db.transaction(async (tx) => {
    const updated = await tx.query<{ id: string; status: string }>(UPDATE_STATUS_SQL, {
      $tenant_id: ctx.tenant_id,
      $is_live: ctx.is_live,
      $lead_id: params.lead_id,
      $status: params.status,
      $partner_id: access.role === 'partner' ? access.partnerRowId : null,
    });
    const lead = updated.rows[0];
    if (!lead) throw new Error('LEAD_NOT_FOUND');

    await tx.query(
      `INSERT INTO gt_lead_event (tenant_id, assessment_response_id, lead_id, event_type, payload, created_by)
       SELECT $tenant_id, r.id, $lead_id, 'status_changed', $payload::jsonb, $created_by
         FROM gt_assessment_response r WHERE r.lead_id = $lead_id`,
      {
        $tenant_id: ctx.tenant_id,
        $lead_id: params.lead_id,
        $payload: JSON.stringify({ status: params.status }),
        $created_by: ctx.user_id,
      },
    );

    return lead;
  });

  return { lead: result, recipe: 'confirmation' };
}
