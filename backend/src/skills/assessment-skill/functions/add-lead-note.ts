/**
 * assessment-skill: add_lead_note
 * Free-text note on a lead's timeline. The EXISTS/ownership check lives in
 * the SQL itself (insert-lead-note.sql) so a partner can't note a lead that
 * isn't theirs by guessing an id — the INSERT simply returns no row.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { resolvePartnerContext } from '../partner-context';

const INSERT_NOTE_SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-lead-note.sql'), 'utf-8');

interface AddLeadNoteParams {
  lead_id: string;
  text: string;
}

export async function add_lead_note(params: AddLeadNoteParams, ctx: SkillContext) {
  if (!params.lead_id) throw new Error('lead_id is required');
  if (!params.text?.trim()) throw new Error('text is required');
  const access = await resolvePartnerContext(ctx);

  const result = await ctx.db.query<{ id: string; created_at: Date }>(INSERT_NOTE_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $lead_id: params.lead_id,
    $payload: JSON.stringify({ text: params.text.trim() }),
    $created_by: ctx.user_id,
    $partner_id: access.role === 'partner' ? access.partnerRowId : null,
  });
  const note = result.rows[0];
  if (!note) throw new Error('LEAD_NOT_FOUND');

  return { note_id: note.id, created_at: note.created_at, recipe: 'confirmation' };
}
