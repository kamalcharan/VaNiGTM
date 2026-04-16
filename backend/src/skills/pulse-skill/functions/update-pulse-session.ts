/**
 * pulse-skill: update_pulse_session
 *
 * Updates a pulse session's mutable fields and handles status transitions.
 * Only provided (non-null) params are applied.
 *
 * Status transition side-effects (handled in SQL):
 *   → in_progress  : sets started_at = NOW() if not already set
 *   → completed    : sets ended_at = NOW(), computes duration_minutes
 *   → missed       : sets ended_at = NOW()
 *   → cancelled    : sets ended_at = NOW()
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { PulseSession } from './create-pulse-session';

const UPDATE_SQL = fs.readFileSync(path.join(__dirname, '../queries/update-pulse-session.sql'), 'utf-8');

interface UpdatePulseSessionParams {
  id:                   number;
  status?:              'scheduled' | 'prep_ready' | 'in_progress' | 'completed' | 'missed' | 'cancelled';
  scheduled_at?:        string;
  template?:            string;
  medium?:              string;
  jtd_appointment_id?:  string;
  meeting_notes?:       string;
  vani_brief?:          string;
  vani_summary?:        string;
  summary_confirmed?:   boolean;
  report_generated?:    boolean;
  duration_minutes?:    number;
  next_session_id?:     number;
  assigned_to?:         string;
}

interface UpdatePulseSessionResult {
  session: PulseSession;
  recipe:  'pulse-session';
}

export async function update_pulse_session(
  params: UpdatePulseSessionParams,
  ctx: SkillContext,
): Promise<UpdatePulseSessionResult> {
  if (!params.id) {
    throw Object.assign(new Error('id is required'), { code: 'VALIDATION_ERROR' });
  }

  const result = await ctx.db.transaction(async (client) => {
    const res = await client.query<PulseSession>(UPDATE_SQL, {
      $id:                  params.id,
      $tenant_id:           ctx.tenant_id,
      $is_live:             ctx.is_live,
      $status:              params.status              ?? null,
      $scheduled_at:        params.scheduled_at        ?? null,
      $template:            params.template            ?? null,
      $medium:              params.medium              ?? null,
      $jtd_appointment_id:  params.jtd_appointment_id  ?? null,
      $meeting_notes:       params.meeting_notes       ?? null,
      $vani_brief:          params.vani_brief          ?? null,
      $vani_summary:        params.vani_summary        ?? null,
      $summary_confirmed:   params.summary_confirmed   ?? null,
      $report_generated:    params.report_generated    ?? null,
      $duration_minutes:    params.duration_minutes    ?? null,
      $next_session_id:     params.next_session_id     ?? null,
      $assigned_to:         params.assigned_to         ?? null,
    });

    if (!res.rows[0]) {
      throw Object.assign(
        new Error('Pulse session not found or does not belong to this tenant'),
        { code: 'NOT_FOUND' },
      );
    }
    return res.rows[0];
  });

  return { session: result, recipe: 'pulse-session' };
}
