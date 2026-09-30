/**
 * access-skill: list_requests
 * Closed-beta access requests in the caller's workspace (see SKILL.md).
 * Tenant and environment come from the JWT; RLS applies on top.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/list-requests.sql'), 'utf-8');

interface AccessRequest {
  lead_id: string; lead_no: string | null; name: string; email: string; company: string; role_title: string;
  country_code: string | null; mobile: string | null; site: string | null; consent_text: string | null;
  requested_at: Date; times_asked: number; status: string;
}

export async function list_requests(params: { limit?: number }, ctx: SkillContext) {
  const limit = Math.min(Math.max(Number(params.limit ?? 50) || 50, 1), 200);
  const r = await ctx.db.query<AccessRequest>(SQL, { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $limit: limit });
  return { requests: r.rows, total: r.rows.length, recipe: 'access-requests' as const };
}
