/**
 * client-skill: update_client
 * Update client KYC fields, risk profile, onboarding status, or survival status.
 *
 * Business rules:
 * - survival_status must be 'alive' or 'deceased'
 * - When setting 'alive', date_of_death is forced to NULL (DB constraint)
 * - When setting 'deceased', date_of_death is required
 * - Dynamic SET clause — intentional exception to the SQL-file rule.
 */

import { SkillContext } from '../../../shared/types';

const VALID_RISK_PROFILES       = ['conservative', 'moderate', 'aggressive'] as const;
const VALID_ONBOARDING_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'] as const;
const VALID_SURVIVAL_STATUSES   = ['alive', 'deceased'] as const;

interface UpdateClientParams {
  client_id: number;
  pan?: string;
  dob?: string;
  anniversary_date?: string;
  ext_ref_id?: string;
  risk_profile?: string;
  onboarding_status?: string;
  referred_by_name?: string;
  survival_status?: string;
  /** Required when survival_status = 'deceased'. Pass null to clear (alive). */
  date_of_death?: string | null;
}

interface UpdateClientResult {
  client: {
    id: number;
    pan: string | null;
    dob: string | null;
    ext_ref_id: string | null;
    risk_profile: string | null;
    onboarding_status: string;
    survival_status: string;
    date_of_death: string | null;
    updated_at: string;
  };
  recipe: 'client-card';
}

export async function update_client(
  params: UpdateClientParams,
  ctx: SkillContext
): Promise<UpdateClientResult> {
  const {
    client_id,
    risk_profile,
    onboarding_status,
    survival_status,
    date_of_death,
    pan,
    dob,
    anniversary_date,
    ext_ref_id,
    referred_by_name,
  } = params;

  if (risk_profile && !VALID_RISK_PROFILES.includes(risk_profile as typeof VALID_RISK_PROFILES[number])) {
    throw new Error(`Invalid risk_profile. Must be one of: ${VALID_RISK_PROFILES.join(', ')}`);
  }
  if (onboarding_status && !VALID_ONBOARDING_STATUSES.includes(onboarding_status as typeof VALID_ONBOARDING_STATUSES[number])) {
    throw new Error(`Invalid onboarding_status. Must be one of: ${VALID_ONBOARDING_STATUSES.join(', ')}`);
  }
  if (survival_status !== undefined && !VALID_SURVIVAL_STATUSES.includes(survival_status as typeof VALID_SURVIVAL_STATUSES[number])) {
    throw new Error(`Invalid survival_status. Must be: alive or deceased`);
  }
  if (survival_status === 'deceased' && date_of_death === undefined) {
    throw new Error('date_of_death is required when survival_status is deceased');
  }
  if (survival_status === 'alive' && date_of_death !== undefined && date_of_death !== null) {
    throw new Error('date_of_death must not be set when survival_status is alive');
  }

  const fields: Record<string, unknown> = {};
  if (pan !== undefined)              fields.pan = pan;
  if (dob !== undefined)              fields.dob = dob;
  if (anniversary_date !== undefined) fields.anniversary_date = anniversary_date;
  if (ext_ref_id !== undefined)       fields.ext_ref_id = ext_ref_id;
  if (referred_by_name !== undefined) fields.referred_by_name = referred_by_name;
  if (risk_profile)                   fields.risk_profile = risk_profile;
  if (onboarding_status)              fields.onboarding_status = onboarding_status;
  if (survival_status !== undefined) {
    fields.survival_status = survival_status;
    // Enforce the DB constraint at the application layer: alive → NULL date_of_death
    fields.date_of_death = survival_status === 'alive' ? null : date_of_death;
  } else if (date_of_death !== undefined) {
    // Caller is only updating date_of_death without changing survival_status
    fields.date_of_death = date_of_death;
  }

  if (Object.keys(fields).length === 0) {
    throw new Error('At least one field to update is required');
  }

  // Dynamic SET clause built from caller-supplied fields.
  const setClauses = Object.keys(fields).map((k) => `${k} = $${k}`).join(', ');
  const queryParams: Record<string, unknown> = {
    $client_id:  client_id,
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
  };
  for (const [k, v] of Object.entries(fields)) {
    queryParams[`$${k}`] = v;
  }

  const res = await ctx.db.query<{
    id: number;
    pan: string | null;
    dob: string | null;
    ext_ref_id: string | null;
    risk_profile: string | null;
    onboarding_status: string;
    survival_status: string;
    date_of_death: string | null;
    updated_at: string;
  }>(
    `UPDATE ki_clients
     SET ${setClauses}, updated_at = now()
     WHERE id = $client_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
     RETURNING id, pan, dob, ext_ref_id, risk_profile, onboarding_status, survival_status, date_of_death, updated_at`,
    queryParams
  );

  if (!res.rows[0]) {
    throw new Error(`Client ${client_id} not found or not accessible`);
  }

  return { client: res.rows[0], recipe: 'client-card' };
}
