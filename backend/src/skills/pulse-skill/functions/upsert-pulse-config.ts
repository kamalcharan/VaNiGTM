/**
 * pulse-skill: upsert_pulse_config
 *
 * Creates or updates the active pulse config for a client.
 * If an active config already exists for this client+env, it is updated.
 * All fields except client_id are optional on update (COALESCE in SQL).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { PulseConfig } from './get-pulse-config';

const UPSERT_SQL = fs.readFileSync(path.join(__dirname, '../queries/upsert-pulse-config.sql'), 'utf-8');

interface UpsertPulseConfigParams {
  client_id:           number;
  contact_id?:         number;
  frequency?:          'monthly' | 'bimonthly' | 'quarterly' | 'custom';
  custom_days?:        number;
  template?:           'full_review' | 'quick_checkin' | 'annual_review' | 'gap_followup';
  medium?:             'phone' | 'google_meet' | 'in_person' | 'whatsapp';
  preferred_day?:      string;
  preferred_time?:     string;
  jtd_auto_schedule?:  boolean;
  vani_auto_brief?:    boolean;
  vani_include_gaps?:  boolean;
  client_reminder?:    boolean;
  assigned_to?:        string;
}

interface UpsertPulseConfigResult {
  config: PulseConfig;
  recipe: 'pulse-config';
}

export async function upsert_pulse_config(
  params: UpsertPulseConfigParams,
  ctx: SkillContext,
): Promise<UpsertPulseConfigResult> {
  if (!params.client_id) {
    throw Object.assign(new Error('client_id is required'), { code: 'VALIDATION_ERROR' });
  }

  const result = await ctx.db.transaction(async (client) => {
    const res = await client.query<PulseConfig>(UPSERT_SQL, {
      $tenant_id:          ctx.tenant_id,
      $is_live:            ctx.is_live,
      $client_id:          params.client_id,
      $contact_id:         params.contact_id         ?? null,
      $frequency:          params.frequency           ?? null,
      $custom_days:        params.custom_days         ?? null,
      $template:           params.template            ?? null,
      $medium:             params.medium              ?? null,
      $preferred_day:      params.preferred_day       ?? null,
      $preferred_time:     params.preferred_time      ?? null,
      $jtd_auto_schedule:  params.jtd_auto_schedule   ?? null,
      $vani_auto_brief:    params.vani_auto_brief      ?? null,
      $vani_include_gaps:  params.vani_include_gaps    ?? null,
      $client_reminder:    params.client_reminder      ?? null,
      $assigned_to:        params.assigned_to          ?? null,
      $created_by:         ctx.user_id                 ?? null,
    });
    return res.rows[0];
  });

  return { config: result, recipe: 'pulse-config' };
}
