/**
 * assessment-skill: get_leads
 * Console lead list. Partner role is scoped to their own leads (partner_id
 * from gt_partner, not client-supplied); owner sees all leads in the tenant.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const GET_LEADS_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-leads.sql'), 'utf-8');

interface GetLeadsParams {
  status?: string;
  limit?: number;
  offset?: number;
}

interface LeadRow {
  id: string;
  lead_no: string | null;
  name: string;
  email: string;
  company: string;
  role_title: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  partner_name: string | null;
  response_id: string | null;
  health_score: number | null;
  band: string | null;
}

interface GetLeadsResult {
  leads: LeadRow[];
  total: number;
  recipe: 'lead-list';
}

export async function get_leads(params: GetLeadsParams, ctx: SkillContext): Promise<GetLeadsResult> {
  const access = await resolvePartnerContext(ctx);
  const limit = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const result = await ctx.db.query<LeadRow>(GET_LEADS_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $partner_id: access.role === 'partner' ? access.partnerRowId : null,
    $status: params.status ?? null,
    $limit: limit,
    $offset: offset,
  });

  return { leads: result.rows, total: result.rows.length, recipe: 'lead-list' };
}
