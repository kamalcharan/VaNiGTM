/**
 * KI-27: get_client_profile — Complete client profile with demographics,
 * portfolio summary, goals summary, risk score.
 * PAN display: masked as XXXXX1234X
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface ProfileRow {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  pan_encrypted: string | null;
  pan_last4: string | null;
  dob: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  occupation: string | null;
  annual_income: number | null;
  risk_capacity: string | null;
  risk_tolerance: string | null;
  risk_required: string | null;
  risk_overall: string | null;
  family_group_id: number | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  last_interaction: string | null;
  portfolio_total_value: number;
  portfolio_total_invested: number;
  portfolio_return_pct: number;
  portfolio_scheme_count: number;
  goals_total: number;
  goals_on_track: number;
  goals_at_risk: number;
  goals_behind: number;
}

interface GetClientProfileResult {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  pan: string | null;
  dob: string | null;
  address: string | null;
  occupation: string | null;
  annual_income: number | null;
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
  family_group_id: number | null;
  tags: string[];
  notes: string | null;
  created_at: string;
  last_interaction: string | null;
  recipe: 'client-360';
}

/**
 * Mask PAN as XXXXX1234X.
 * pan_last4 stores last 4 chars. Full PAN is 10 chars: 5 letters + 4 digits + 1 letter.
 * We display: XXXXX + last4 + X (if we only have last4, assume the check letter is unknown).
 * Actually, pan_last4 = last 4 chars of PAN, so PAN = AAAAANNNNC → last4 = NNNC.
 * Masked: XXXXX + last4[0..2] + last4[3] → XXXXXNNNC → but spec says XXXXX1234X.
 * The spec pattern XXXXX1234X means: 5 X's + 4 digits + 1 letter.
 * pan_last4 stores "1234" (4 chars), so masked = "XXXXX" + pan_last4 + "X"
 */
export function maskPan(panLast4: string | null): string | null {
  if (!panLast4) return null;
  return `XXXXX${panLast4}X`;
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/client-profile.sql'),
  'utf-8'
);

export async function get_client_profile(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetClientProfileResult | null> {
  const { client_id } = params;

  const result = await ctx.db.query<ProfileRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
  });

  if (result.rows.length === 0) return null;

  const r = result.rows[0];

  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    pan: maskPan(r.pan_last4),
    dob: r.dob,
    address: [r.address, r.city, r.state].filter(Boolean).join(', ') || null,
    occupation: r.occupation,
    annual_income: r.annual_income ? Number(r.annual_income) : null,
    portfolio_summary: {
      total_value: Number(r.portfolio_total_value),
      total_invested: Number(r.portfolio_total_invested),
      return_pct: Number(r.portfolio_return_pct),
      scheme_count: Number(r.portfolio_scheme_count),
    },
    goals_summary: {
      total_goals: Number(r.goals_total),
      on_track: Number(r.goals_on_track),
      at_risk: Number(r.goals_at_risk),
      behind: Number(r.goals_behind),
    },
    risk_profile: {
      capacity: r.risk_capacity,
      tolerance: r.risk_tolerance,
      required: r.risk_required,
      overall: r.risk_overall,
    },
    family_group_id: r.family_group_id,
    tags: r.tags || [],
    notes: r.notes,
    created_at: r.created_at,
    last_interaction: r.last_interaction,
    recipe: 'client-360',
  };
}
