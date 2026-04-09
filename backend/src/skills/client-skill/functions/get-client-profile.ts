/**
 * client-skill: get_client_profile
 * 360-degree client view — contact details, masked PAN, portfolio summary, goals summary, risk profile.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CLIENT_PROFILE_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-client-profile.sql'), 'utf-8'
);

interface GetClientProfileParams {
  client_id: number;
}

interface ClientProfileResult {
  recipe: 'client-360';
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  pan: string | null;
  dob: string | null;
  address: string | null;
  occupation: string | null;
  annual_income: number | null;
  family_group_id: number | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  last_interaction: string | null;
  portfolio_summary: {
    total_value: number;
    total_invested: number;
    return_pct: number;
    scheme_count: number;
  };
  goals_summary: {
    total_goals: number;
    on_track: number;
    at_risk: number;
    behind: number;
  };
  risk_profile: {
    capacity: string | null;
    tolerance: string | null;
    required: string | null;
    overall: string | null;
  };
}

/**
 * Mask PAN for display: XXXXX{last4}X
 * e.g. last4='1234' → 'XXXXX1234X'
 */
export function maskPan(pan_last4: string | null): string | null {
  if (!pan_last4) return null;
  return `XXXXX${pan_last4}X`;
}

export async function get_client_profile(
  params: GetClientProfileParams,
  ctx: SkillContext
): Promise<ClientProfileResult | null> {
  const res = await ctx.db.query(GET_CLIENT_PROFILE_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id,
  });

  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const totalValue    = Number(row.portfolio_total_value ?? 0);
  const totalInvested = Number(row.portfolio_total_invested ?? 0);
  const returnPct     = totalInvested > 0
    ? Number((((totalValue - totalInvested) / totalInvested) * 100).toFixed(2))
    : 0;

  // Format address as single line
  const addressParts = [
    row.address as string | null,
    row.city as string | null,
    row.state as string | null,
  ].filter(Boolean);
  const addressLine = addressParts.length > 0 ? addressParts.join(', ') : null;

  return {
    recipe: 'client-360',
    id:              Number(row.id),
    name:            String(row.name ?? ''),
    email:           (row.email as string) ?? null,
    phone:           (row.phone as string) ?? null,
    pan:             maskPan((row.pan_last4 as string) ?? null),
    dob:             (row.dob as string) ?? null,
    address:         addressLine,
    occupation:      (row.occupation as string) ?? null,
    annual_income:   row.annual_income != null ? Number(row.annual_income) : null,
    family_group_id: row.family_group_id != null ? Number(row.family_group_id) : null,
    tags:            Array.isArray(row.tags) ? row.tags as string[] : [],
    notes:           (row.notes as string) ?? null,
    created_at:      String(row.created_at ?? ''),
    last_interaction: (row.last_interaction as string) ?? null,
    portfolio_summary: {
      total_value:    totalValue,
      total_invested: totalInvested,
      return_pct:     row.portfolio_return_pct != null ? Number(row.portfolio_return_pct) : returnPct,
      scheme_count:   Number(row.portfolio_scheme_count ?? 0),
    },
    goals_summary: {
      total_goals: Number(row.goals_total ?? 0),
      on_track:    Number(row.goals_on_track ?? 0),
      at_risk:     Number(row.goals_at_risk ?? 0),
      behind:      Number(row.goals_behind ?? 0),
    },
    risk_profile: {
      capacity:  (row.risk_capacity as string) ?? null,
      tolerance: (row.risk_tolerance as string) ?? null,
      required:  (row.risk_required as string) ?? null,
      overall:   (row.risk_overall as string) ?? null,
    },
  };
}
