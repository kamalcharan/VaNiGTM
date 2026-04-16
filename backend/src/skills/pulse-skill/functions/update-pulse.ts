/**
 * pulse-skill: update_pulse
 *
 * Updates a pulse's mutable fields. All fields are optional — only passed
 * fields are changed. completed_at is set automatically on status → 'done'.
 *
 * Special flags:
 *   clear_due_date: true  — explicitly clears due_date to NULL
 *   clear_snooze:   true  — explicitly clears snoozed_until to NULL
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { PulseItem } from './list-pulses';

const UPDATE_SQL = fs.readFileSync(path.join(__dirname, '../queries/update-pulse.sql'), 'utf-8');

interface UpdatePulseParams {
  id:              number;
  status?:         'open' | 'snoozed' | 'done' | 'dismissed';
  priority?:       'high' | 'medium' | 'low';
  title?:          string;
  body?:           string;
  notes?:          string;
  due_date?:       string;   // ISO date YYYY-MM-DD
  snoozed_until?:  string;   // ISO date YYYY-MM-DD
  assigned_to?:    string;   // UUID
  clear_due_date?: boolean;
  clear_snooze?:   boolean;
}

interface UpdatePulseResult {
  pulse:  PulseItem;
  recipe: 'pulse-detail';
}

export async function update_pulse(
  params: UpdatePulseParams,
  ctx: SkillContext
): Promise<UpdatePulseResult> {
  if (!params.id) {
    throw Object.assign(new Error('id is required'), { code: 'VALIDATION_ERROR' });
  }

  const result = await ctx.db.transaction(async (client) => {
    const res = await client.query<PulseItem>(UPDATE_SQL, {
      $id:             params.id,
      $tenant_id:      ctx.tenant_id,
      $is_live:        ctx.is_live,
      $status:         params.status        ?? null,
      $priority:       params.priority      ?? null,
      $title:          params.title?.trim() ?? null,
      $body:           params.body?.trim()  ?? null,
      $notes:          params.notes?.trim() ?? null,
      $due_date:       params.due_date       ?? null,
      $snoozed_until:  params.snoozed_until  ?? null,
      $assigned_to:    params.assigned_to    ?? null,
      $clear_due_date: params.clear_due_date ?? false,
      $clear_snooze:   params.clear_snooze   ?? false,
      $completed_by:   ctx.user_id           ?? null,
    });

    if (!res.rows[0]) {
      throw Object.assign(
        new Error('Pulse not found or does not belong to this tenant'),
        { code: 'NOT_FOUND' }
      );
    }
    return res.rows[0];
  });

  return { pulse: result, recipe: 'pulse-detail' };
}
