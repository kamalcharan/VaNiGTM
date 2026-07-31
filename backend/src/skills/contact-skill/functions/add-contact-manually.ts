/**
 * contact-skill: add_contact_manually
 *
 * A person somebody found by hand — LinkedIn scroll, a mutual, a shot in
 * the dark against a general enquiries page — attached to one prospect.
 *
 * ── WHY THIS IS A SEPARATE FUNCTION FROM promote_from_brief ───────────
 *
 * promote_from_brief is the evidence-only path: source='research', name
 * MUST come from the brief's named_contacts (R-C1), the channel MUST
 * carry a URL from the brief. Rule 12 with teeth.
 *
 * This is the honest override. source='manual' says clearly on the row
 * "a human vouched, no evidence chain behind it". The two paths are
 * different and their provenance stays different — an "info@" typed here
 * cannot come back later carrying research provenance.
 *
 * ── R-C2 STILL APPLIES ────────────────────────────────────────────────
 *
 * If confirm_addressed is set, the person must carry at least one
 * reachable channel. A name with no address does not satisfy the
 * addressed gate no matter who added it.
 *
 * ── AND THE JOURNEY STILL MOVES THE SAME WAY ──────────────────────────
 *
 * moveIfAt(['sourced','researched','qualified']) — same primitive as
 * promote_from_brief. R-J5/R7 unchanged: a manually added contact on an
 * already-contacted journey does not rewind it.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { moveIfAt, findJourney } from '../../journey-skill/journey.service';

const INSERT_CHANNEL_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-channel.sql'), 'utf-8');

interface AddContactManuallyParams {
  prospect_id: number;
  name: string;
  job_title?: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  /** Optional free-text note on how this person was found. Kept in `raw`. */
  note?: string;
  /**
   * Move the journey to `addressed` in the same transaction. Requires at
   * least one channel (R-C2). Without it, the contact is written and
   * pinned onto the journey but the journey stays put.
   */
  confirm_addressed?: boolean;
}

const CHANNEL_KINDS = new Set(['email', 'mobile', 'whatsapp', 'linkedin']);

export async function add_contact_manually(
  params: AddContactManuallyParams, ctx: SkillContext,
) {
  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(prospectId)) throw new Error('prospect_id is required');

  const name = String(params.name ?? '').trim();
  if (!name) throw new Error('name is required');
  if (name.length > 200) throw new Error('name is too long (200 char limit).');

  // Normalise channels the same way promote_from_brief does, so a
  // manually-typed "info@" or "not stated" fails the same way in both paths.
  const email = clean('email', params.email);
  const phone = clean('mobile', params.phone);
  const linkedin = clean('linkedin', params.linkedin_url);

  const wantsAddressed = params.confirm_addressed === true;
  const hasChannel = Boolean(email || phone || linkedin);
  if (wantsAddressed && !hasChannel) {
    throw new Error(
      'confirm_addressed requires at least one channel — R-C2 says a name '
      + 'with no reachable address does not count as addressed.',
    );
  }

  return ctx.db.transaction(async (tx) => {
    // The prospect must be ours. tenant_id + is_live in the WHERE are the
    // authorisation. A prospect from another tenant simply matches nothing.
    const own = await tx.query<{ id: string }>(
      `SELECT id::text FROM gt_prospects
        WHERE id = $prospect_id
          AND tenant_id = $tenant_id AND is_live = $is_live`,
      { prospect_id: prospectId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (!own.rows[0]) throw new Error('No such prospect.');

    const ins = await tx.query<{ id: string; contact_no: string }>(
      `INSERT INTO gt_contacts
         (tenant_id, is_live, name, contact_no, prospect_id, job_title,
          source, raw, created_by)
       VALUES ($tenant_id, $is_live, $name,
               gt_next_seq($tenant_id::uuid, 'contact'),
               $prospect_id, $job_title, 'manual', $raw::jsonb, $user_id)
       RETURNING id::text, contact_no`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        name,
        prospect_id: prospectId,
        job_title: String(params.job_title ?? '').trim() || null,
        raw: JSON.stringify({
          added: 'by_hand',
          note: String(params.note ?? '').trim() || null,
        }),
        user_id: ctx.user_id,
      },
    );
    const contactId = Number(ins.rows[0].id);

    const channels: Array<{ type: string; value: string; primary: boolean }> = [];
    if (email) channels.push({ type: 'email', value: email, primary: true });
    if (phone) channels.push({ type: 'mobile', value: phone, primary: !email });
    if (linkedin) channels.push({ type: 'linkedin', value: linkedin, primary: !email && !phone });

    const writtenChannels: Array<{ id: number; channel_type: string; channel_value: string }> = [];
    for (const c of channels) {
      const r = await tx.query<{ id: string; channel_type: string; channel_value: string }>(
        INSERT_CHANNEL_SQL,
        {
          contact_id: contactId,
          tenant_id: ctx.tenant_id, is_live: ctx.is_live,
          channel_type: c.type, channel_value: c.value,
          channel_subtype: 'work', is_primary: c.primary,
        },
      );
      if (r.rows[0]) writtenChannels.push({
        id: Number(r.rows[0].id),
        channel_type: r.rows[0].channel_type,
        channel_value: r.rows[0].channel_value,
      });
    }

    // Journey move / pin. Same moveIfAt primitive promote_from_brief uses,
    // so re-adding a manual contact on an already-contacted account cannot
    // rewind it (R-J5/R7).
    const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };
    let journeyState: string | null = null;
    let journeyMoved = false;
    if (wantsAddressed) {
      const before = await findJourney(tx, scope, prospectId);
      const moved = await moveIfAt(
        tx, scope, prospectId,
        ['sourced', 'researched', 'qualified'], 'addressed',
        {
          actor: 'human', actor_id: ctx.user_id,
          contact_id: contactId,
          payload: { contact_id: contactId, added_manually: true },
        },
      );
      journeyState = moved?.state ?? before?.state ?? null;
      journeyMoved = moved !== null;
    } else {
      // Pin without moving — a manual contact is still the person the
      // reviewer will confirm next; the journey knowing that costs nothing.
      await tx.query(
        `UPDATE gt_journeys
            SET contact_id = COALESCE(contact_id, $contact_id::bigint),
                updated_at = now()
          WHERE tenant_id = $tenant_id AND is_live = $is_live
            AND prospect_id = $prospect_id`,
        {
          tenant_id: ctx.tenant_id, is_live: ctx.is_live,
          prospect_id: prospectId, contact_id: contactId,
        },
      );
    }

    return {
      contact_id: contactId,
      contact_no: ins.rows[0].contact_no,
      channels_written: writtenChannels,
      confirmed_addressed: wantsAddressed,
      journey_state: journeyState,
      journey_moved: journeyMoved,
      recipe: 'contact-detail' as const,
    };
  });
}

/** Same normalisation promote_from_brief uses. The "not stated" idiom
 *  drops rather than being written as a channel value. */
function clean(kind: 'email' | 'mobile' | 'linkedin', v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^(not stated|not specified|not available|unknown|n\/?a|none|nil|null|-)$/i.test(s)) return null;
  if (kind === 'email' && !s.includes('@')) return null;
  return s;
}
