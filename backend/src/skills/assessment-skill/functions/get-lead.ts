/**
 * assessment-skill: get_lead
 * Single lead with its assessment response (answers, scoring) and timeline.
 * Partner role can only fetch their own leads — the $partner_id filter in
 * get-lead.sql returns zero rows for anyone else's lead, not an error, same
 * as every other tenant-scoped 404 pattern in this codebase.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const GET_LEAD_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-lead.sql'), 'utf-8');
const GET_TIMELINE_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-lead-timeline.sql'), 'utf-8');

interface GetLeadParams {
  lead_id: string;
}

export async function get_lead(params: GetLeadParams, ctx: SkillContext) {
  if (!params.lead_id) throw new Error('lead_id is required');
  const access = await resolvePartnerContext(ctx);

  const leadResult = await ctx.db.query(GET_LEAD_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $lead_id: params.lead_id,
    $partner_id: access.role === 'partner' ? access.partnerRowId : null,
  });
  const lead = leadResult.rows[0];
  if (!lead) throw new Error('LEAD_NOT_FOUND');

  const timelineResult = await ctx.db.query(GET_TIMELINE_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $lead_id: params.lead_id,
  });

  return { lead, timeline: timelineResult.rows, recipe: 'lead-detail' };
}
