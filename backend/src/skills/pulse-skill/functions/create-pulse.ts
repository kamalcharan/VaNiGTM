/**
 * pulse-skill: create_pulse
 *
 * Creates a manual follow-up pulse for a prospect (contact_id) or client (client_id).
 * Exactly one of contact_id / client_id must be provided.
 * pulse_type must be 'prospect_followup' or 'client_followup'.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { PulseItem } from './list-pulses';

const CREATE_SQL = fs.readFileSync(path.join(__dirname, '../queries/create-pulse.sql'), 'utf-8');

interface CreatePulseParams {
  pulse_type:   'prospect_followup' | 'client_followup';
  title:        string;
  body?:        string;
  priority?:    'high' | 'medium' | 'low';
  due_date?:    string;            // ISO date YYYY-MM-DD
  notes?:       string;
  contact_id?:  number;            // required for prospect_followup
  client_id?:   number;            // required for client_followup
  snapshot_id?: number;
  assigned_to?: string;            // UUID of the MFD user
}

interface CreatePulseResult {
  pulse:  PulseItem;
  recipe: 'pulse-detail';
}

export async function create_pulse(
  params: CreatePulseParams,
  ctx: SkillContext
): Promise<CreatePulseResult> {
  if (!params.title?.trim()) {
    throw Object.assign(new Error('title is required'), { code: 'VALIDATION_ERROR' });
  }

  const result = await ctx.db.transaction(async (client) => {
    const res = await client.query<PulseItem>(CREATE_SQL, {
      $tenant_id:   ctx.tenant_id,
      $is_live:     ctx.is_live,
      $pulse_type:  params.pulse_type,
      $priority:    params.priority   ?? 'medium',
      $title:       params.title.trim(),
      $body:        params.body?.trim()   ?? null,
      $notes:       params.notes?.trim()  ?? null,
      $due_date:    params.due_date       ?? null,
      $contact_id:  params.contact_id     ?? null,
      $client_id:   params.client_id      ?? null,
      $snapshot_id: params.snapshot_id    ?? null,
      $assigned_to: params.assigned_to    ?? null,
    });
    return res.rows[0];
  });

  return { pulse: result, recipe: 'pulse-detail' };
}
