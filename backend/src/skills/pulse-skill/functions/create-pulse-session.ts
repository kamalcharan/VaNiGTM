/**
 * pulse-skill: create_pulse_session
 *
 * Creates a new pulse session (meeting instance) for a client.
 * Links to ki_pulse_config via config_id (optional for ad-hoc sessions).
 * Initial status is always 'scheduled'.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const CREATE_SQL = fs.readFileSync(path.join(__dirname, '../queries/create-pulse-session.sql'), 'utf-8');

export interface PulseSession {
  id:                 number;
  tenant_id:          string;
  is_live:            boolean;
  config_id:          number | null;
  client_id:          number;
  contact_id:         number | null;
  scheduled_at:       string;
  started_at:         string | null;
  ended_at:           string | null;
  duration_minutes:   number | null;
  status:             'scheduled' | 'prep_ready' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  template:           string;
  medium:             string;
  jtd_appointment_id: string | null;
  meeting_notes:      string | null;
  vani_brief:         string | null;
  vani_summary:       string | null;
  summary_confirmed:  boolean;
  report_generated:   boolean;
  next_session_id:    number | null;
  assigned_to:        string | null;
  created_at:         string;
  updated_at:         string;
}

interface CreatePulseSessionParams {
  client_id:           number;
  scheduled_at:        string;         // ISO datetime
  config_id?:          number;
  contact_id?:         number;
  template?:           'full_review' | 'quick_checkin' | 'annual_review' | 'gap_followup';
  medium?:             'phone' | 'google_meet' | 'in_person' | 'whatsapp';
  jtd_appointment_id?: string;
  assigned_to?:        string;
}

interface CreatePulseSessionResult {
  session: PulseSession;
  recipe:  'pulse-session';
}

export async function create_pulse_session(
  params: CreatePulseSessionParams,
  ctx: SkillContext,
): Promise<CreatePulseSessionResult> {
  if (!params.client_id) {
    throw Object.assign(new Error('client_id is required'), { code: 'VALIDATION_ERROR' });
  }
  if (!params.scheduled_at) {
    throw Object.assign(new Error('scheduled_at is required'), { code: 'VALIDATION_ERROR' });
  }

  const result = await ctx.db.transaction(async (client) => {
    const res = await client.query<PulseSession>(CREATE_SQL, {
      $tenant_id:          ctx.tenant_id,
      $is_live:            ctx.is_live,
      $client_id:          params.client_id,
      $config_id:          params.config_id          ?? null,
      $contact_id:         params.contact_id         ?? null,
      $scheduled_at:       params.scheduled_at,
      $template:           params.template           ?? 'full_review',
      $medium:             params.medium             ?? 'phone',
      $jtd_appointment_id: params.jtd_appointment_id ?? null,
      $assigned_to:        params.assigned_to        ?? null,
    });
    return res.rows[0];
  });

  return { session: result, recipe: 'pulse-session' };
}
