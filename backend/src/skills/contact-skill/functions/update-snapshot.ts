/**
 * contact-skill: update_snapshot
 * Upsert the financial snapshot for a contact.
 * Creates if not exists, updates if exists.
 */

import { SkillContext } from '../../../shared/types';

const VALID_RISK_PROFILES = ['conservative', 'moderate', 'aggressive'] as const;

interface UpdateSnapshotParams {
  contact_id: number;
  risk_profile?: string;
  net_worth_estimate?: number;
  annual_income_estimate?: number;
  investment_horizon_years?: number;
  existing_mf_breakdown?: Record<string, number>;
  goals_lite?: Array<{ name: string; target_amount: number; timeline_years: number }>;
  notes?: string;
}

interface UpdateSnapshotResult {
  snapshot: {
    id: number;
    contact_id: number;
    risk_profile: string | null;
    updated_at: string;
  };
  recipe: 'snapshot-view';
}

export async function update_snapshot(
  params: UpdateSnapshotParams,
  ctx: SkillContext
): Promise<UpdateSnapshotResult> {
  const { contact_id, risk_profile, ...rest } = params;

  if (risk_profile && !VALID_RISK_PROFILES.includes(risk_profile as typeof VALID_RISK_PROFILES[number])) {
    throw new Error(`Invalid risk_profile. Must be one of: ${VALID_RISK_PROFILES.join(', ')}`);
  }

  // Verify contact belongs to this tenant
  const contactCheck = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_contacts
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );
  if (!contactCheck.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  const res = await ctx.db.query<{ id: number; contact_id: number; risk_profile: string | null; updated_at: string }>(
    `INSERT INTO ki_contact_snapshot
       (contact_id, tenant_id, is_live,
        risk_profile, net_worth_estimate, annual_income_estimate,
        investment_horizon_years, existing_mf_breakdown, goals_lite, notes)
     VALUES
       ($contact_id, $tenant_id, $is_live,
        $risk_profile, $net_worth_estimate, $annual_income_estimate,
        $investment_horizon_years, $existing_mf_breakdown, $goals_lite, $notes)
     ON CONFLICT (contact_id) DO UPDATE SET
       risk_profile              = COALESCE(EXCLUDED.risk_profile, ki_contact_snapshot.risk_profile),
       net_worth_estimate        = COALESCE(EXCLUDED.net_worth_estimate, ki_contact_snapshot.net_worth_estimate),
       annual_income_estimate    = COALESCE(EXCLUDED.annual_income_estimate, ki_contact_snapshot.annual_income_estimate),
       investment_horizon_years  = COALESCE(EXCLUDED.investment_horizon_years, ki_contact_snapshot.investment_horizon_years),
       existing_mf_breakdown     = COALESCE(EXCLUDED.existing_mf_breakdown, ki_contact_snapshot.existing_mf_breakdown),
       goals_lite                = COALESCE(EXCLUDED.goals_lite, ki_contact_snapshot.goals_lite),
       notes                     = COALESCE(EXCLUDED.notes, ki_contact_snapshot.notes),
       updated_at                = now()
     RETURNING id, contact_id, risk_profile, updated_at`,
    {
      $contact_id:              contact_id,
      $tenant_id:               ctx.tenant_id,
      $is_live:                 ctx.is_live,
      $risk_profile:            risk_profile ?? null,
      $net_worth_estimate:      rest.net_worth_estimate ?? null,
      $annual_income_estimate:  rest.annual_income_estimate ?? null,
      $investment_horizon_years: rest.investment_horizon_years ?? null,
      $existing_mf_breakdown:   rest.existing_mf_breakdown ? JSON.stringify(rest.existing_mf_breakdown) : null,
      $goals_lite:              rest.goals_lite ? JSON.stringify(rest.goals_lite) : null,
      $notes:                   rest.notes ?? null,
    }
  );

  return { snapshot: res.rows[0], recipe: 'snapshot-view' };
}
