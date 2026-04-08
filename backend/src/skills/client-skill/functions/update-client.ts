/**
 * client-skill: update_client
 * Update client KYC fields, risk profile, or onboarding status.
 */

import { SkillContext } from '../../../shared/types';

const VALID_RISK_PROFILES       = ['conservative', 'moderate', 'aggressive'] as const;
const VALID_ONBOARDING_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;

interface UpdateClientParams {
  client_id: number;
  pan?: string;
  dob?: string;
  anniversary_date?: string;
  ext_ref_id?: string;
  risk_profile?: string;
  onboarding_status?: string;
  referred_by_name?: string;
}

interface UpdateClientResult {
  client: {
    id: number;
    pan: string | null;
    dob: string | null;
    ext_ref_id: string | null;
    risk_profile: string | null;
    onboarding_status: string;
    updated_at: string;
  };
  recipe: 'client-card';
}

export async function update_client(
  params: UpdateClientParams,
  ctx: SkillContext
): Promise<UpdateClientResult> {
  const { client_id, risk_profile, onboarding_status, ...rest } = params;

  if (risk_profile && !VALID_RISK_PROFILES.includes(risk_profile as typeof VALID_RISK_PROFILES[number])) {
    throw new Error(`Invalid risk_profile. Must be one of: ${VALID_RISK_PROFILES.join(', ')}`);
  }
  if (onboarding_status && !VALID_ONBOARDING_STATUSES.includes(onboarding_status as typeof VALID_ONBOARDING_STATUSES[number])) {
    throw new Error(`Invalid onboarding_status. Must be one of: ${VALID_ONBOARDING_STATUSES.join(', ')}`);
  }

  const fields: Record<string, unknown> = {};
  if (rest.pan !== undefined)             fields.pan = rest.pan;
  if (rest.dob !== undefined)             fields.dob = rest.dob;
  if (rest.anniversary_date !== undefined) fields.anniversary_date = rest.anniversary_date;
  if (rest.ext_ref_id !== undefined)      fields.ext_ref_id = rest.ext_ref_id;
  if (rest.referred_by_name !== undefined) fields.referred_by_name = rest.referred_by_name;
  if (risk_profile)                       fields.risk_profile = risk_profile;
  if (onboarding_status)                  fields.onboarding_status = onboarding_status;

  if (Object.keys(fields).length === 0) {
    throw new Error('At least one field to update is required');
  }

  // Dynamic SET clause built from caller-supplied fields.
  // Cannot be extracted to a static .sql file — intentional exception to the SQL-file rule.
  const setClauses = Object.keys(fields).map((k) => `${k} = $${k}`).join(', ');
  const queryParams: Record<string, unknown> = { $client_id: client_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live };
  for (const [k, v] of Object.entries(fields)) {
    queryParams[`$${k}`] = v;
  }

  const res = await ctx.db.query<{
    id: number; pan: string | null; dob: string | null;
    ext_ref_id: string | null; risk_profile: string | null;
    onboarding_status: string; updated_at: string;
  }>(
    `UPDATE ki_clients
     SET ${setClauses}, updated_at = now()
     WHERE id = $client_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
     RETURNING id, pan, dob, ext_ref_id, risk_profile, onboarding_status, updated_at`,
    queryParams
  );

  if (!res.rows[0]) {
    throw new Error(`Client ${client_id} not found or not accessible`);
  }

  return { client: res.rows[0], recipe: 'client-card' };
}
