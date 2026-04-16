/**
 * pulse-skill: get_pulse_config
 *
 * Returns the active pulse config for a specific client.
 * Returns null in the config field if none exists.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-pulse-config.sql'), 'utf-8');

export interface PulseConfig {
  id:                 number;
  tenant_id:          string;
  is_live:            boolean;
  client_id:          number;
  contact_id:         number | null;
  frequency:          'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  custom_days:        number | null;
  template:           'full_review' | 'quick_checkin' | 'annual_review' | 'gap_followup';
  medium:             'phone' | 'google_meet' | 'in_person' | 'whatsapp';
  preferred_day:      string | null;
  preferred_time:     string | null;
  jtd_auto_schedule:  boolean;
  vani_auto_brief:    boolean;
  vani_include_gaps:  boolean;
  client_reminder:    boolean;
  assigned_to:        string | null;
  is_active:          boolean;
  created_at:         string;
  updated_at:         string;
}

interface GetPulseConfigParams {
  client_id: number;
}

interface GetPulseConfigResult {
  config: PulseConfig | null;
  recipe: 'pulse-config';
}

export async function get_pulse_config(
  params: GetPulseConfigParams,
  ctx: SkillContext,
): Promise<GetPulseConfigResult> {
  if (!params.client_id) {
    throw Object.assign(new Error('client_id is required'), { code: 'VALIDATION_ERROR' });
  }

  const res = await ctx.db.query<PulseConfig>(GET_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id,
  });

  return { config: res.rows[0] ?? null, recipe: 'pulse-config' };
}
