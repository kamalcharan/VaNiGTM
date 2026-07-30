/**
 * contact-skill: promote_from_brief
 *
 * Turn a named_contacts entry on an account brief into a real gt_contacts
 * row with its channels, carrying the URL each address came from.
 *
 * ── THIS IS THE `addressed` GATE ──────────────────────────────────────
 *
 * A journey at `qualified` owes a person. Promoting them here is what
 * lets the journey move to `addressed` — and only IF the person carries
 * at least one reachable channel (R-C2). Promoting a name with no address
 * satisfies neither.
 *
 * ── R-C1: NO INVENTED PEOPLE ──────────────────────────────────────────
 *
 * The brief's named_contacts array is the ONLY source of names this flow
 * accepts. There is no field for the caller to type a fresh one in — if
 * the brief named nobody, the journey sits at qualified and says so.
 * Callers who want to add a person by hand use create_contact; that path
 * takes source='manual', which is different provenance and reads
 * differently on the record. Mixing the two would let "info@" sneak in
 * under source='research' and quietly corrupt the pool of promoted
 * evidence.
 *
 * ── SAME BRIEF, SAME PERSON, SAME ROW ─────────────────────────────────
 *
 * Two callers promoting the same entry on the same brief must produce ONE
 * contact. The uniqueness is (brief_id, named_index) — the position in the
 * brief's array — because two humans in the brief may share a name, and
 * the array position is the only stable identifier the brief can offer.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import { moveIfAt, findJourney } from '../../journey-skill/journey.service';

const INSERT_CHANNEL_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-channel.sql'), 'utf-8');

interface PromoteParams {
  brief_id: number;
  /** Which entry in the brief's named_contacts array. Zero-indexed. */
  named_index: number;
  /**
   * The human's ruling. `email` and `phone` come from the brief's entry;
   * the caller may correct them here — a typo in an evidenced address is
   * still a real correction — but the corrected value keeps the same
   * source_url, because the URL evidences the PERSON, not the exact string.
   */
  email?: string | null;
  phone?: string | null;
  linkedin_url?: string | null;
  /** Extra channels the human found while confirming the person. */
  extra_channels?: Array<{ channel_type: string; channel_value: string }>;
  /**
   * Confirm the address gate. Without it, the contact is created but the
   * journey does NOT move to `addressed` — a person promoted but not
   * confirmed reachable is a draft, not a decision.
   */
  confirm_addressed?: boolean;
}

/** What gt_contacts.source_url looks like in the raw payload we keep for audit. */
interface NamedContact {
  name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
}

const VALID_EXTRA_CHANNELS = new Set(['email', 'mobile', 'whatsapp', 'linkedin', 'other']);

export async function promote_from_brief(params: PromoteParams, ctx: SkillContext) {
  const briefId = Number(params.brief_id);
  const idx = Number(params.named_index);
  if (!Number.isFinite(briefId)) throw new Error('brief_id is required');
  if (!Number.isFinite(idx) || idx < 0) throw new Error('named_index is required (0-based).');

  return ctx.db.transaction(async (tx) => {
    // The brief must be ours. tenant_id + is_live in the WHERE are the
    // authorisation and match nothing when the id is from another tenant.
    const briefRes = await tx.query<{
      prospect_id: string;
      named_contacts: NamedContact[];
      domain: string | null;
    }>(
      `SELECT prospect_id::text, named_contacts, domain
         FROM gt_account_briefs
        WHERE id = $brief_id AND tenant_id = $tenant_id AND is_live = $is_live`,
      { brief_id: briefId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (!briefRes.rows[0]) throw new Error('No such brief.');

    const named = Array.isArray(briefRes.rows[0].named_contacts)
      ? briefRes.rows[0].named_contacts : [];
    if (named.length === 0) {
      // R-C1 with teeth. A brief that named nobody cannot yield anybody —
      // and the message says WHY, not just that it failed, so somebody
      // reading this in a UI knows what to do about it.
      throw new Error(
        'This brief named nobody. It will not be guessed at. Add a contact by '
        + 'hand with create_contact (source=\'manual\'), or research the '
        + 'company again — inventing a recipient is the one mistake that '
        + 'cannot be walked back.',
      );
    }
    if (idx >= named.length) {
      throw new Error(`This brief has ${named.length} named contact(s); index ${idx} is out of range.`);
    }

    const entry = named[idx] ?? {};
    const displayName = String(entry.name ?? '').trim();
    if (!displayName) {
      throw new Error(`Entry ${idx} on this brief carries no name.`);
    }

    // Corrections are respected. But if the caller passed nothing, the
    // brief's own value is used — the brief IS the evidence, so its own
    // address is the default answer.
    const email = normaliseChannel('email',
      params.email === undefined ? entry.email : params.email);
    const phone = normaliseChannel('mobile',
      params.phone === undefined ? entry.phone : params.phone);
    const linkedin = normaliseChannel('linkedin', params.linkedin_url);

    // R-C2 as the pre-check. The database is later; a clear error now beats
    // a mysterious "journey did not move" thirty seconds later.
    const wantsAddressed = params.confirm_addressed === true;
    const hasChannel = Boolean(email || phone || linkedin
      || (params.extra_channels ?? []).length > 0);
    if (wantsAddressed && !hasChannel) {
      throw new Error(
        'confirm_addressed requires at least one reachable channel — a name '
        + 'with no address does not satisfy R-C2. Promote without confirming, '
        + 'or add a channel.',
      );
    }

    const prospectId = Number(briefRes.rows[0].prospect_id);
    const briefUrl = briefRes.rows[0].domain
      ? `https://${briefRes.rows[0].domain}` : null;

    // ── Idempotent promotion ────────────────────────────────────────────
    //
    // A second call for the same (brief, index) returns the row the first
    // call created rather than making a duplicate. The uniqueness is
    // deliberately on the pair, not on the person's name — two humans in
    // the brief may share a name, and the array position is the only
    // stable id the brief can offer.
    const existingRes = await tx.query<{ id: string }>(
      `SELECT id::text FROM gt_contacts
        WHERE tenant_id = $tenant_id AND is_live = $is_live
          AND brief_id = $brief_id
          AND (raw->>'named_index')::int = $named_index`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        brief_id: briefId, named_index: idx,
      },
    );

    let contactId: number;
    let created: boolean;
    if (existingRes.rows[0]) {
      contactId = Number(existingRes.rows[0].id);
      created = false;
    } else {
      // The brief entry is captured in `raw` so the promotion is audit-able
      // even if the brief is later re-run and the entry moves or changes.
      const ins = await tx.query<{ id: string; contact_no: string }>(
        `INSERT INTO gt_contacts
           (tenant_id, is_live, name, contact_no, prospect_id, brief_id,
            job_title, source, raw, created_by)
         VALUES
           ($tenant_id, $is_live, $name,
            gt_next_seq($tenant_id::uuid, 'contact'),
            $prospect_id, $brief_id, $job_title, 'research',
            $raw::jsonb, $user_id)
         RETURNING id::text, contact_no`,
        {
          tenant_id: ctx.tenant_id, is_live: ctx.is_live,
          name: displayName,
          prospect_id: prospectId,
          brief_id: briefId,
          job_title: entry.title ?? null,
          raw: JSON.stringify({
            promoted_from: 'brief',
            brief_id: briefId,
            named_index: idx,
            brief_entry: entry,
          }),
          user_id: ctx.user_id,
        },
      );
      contactId = Number(ins.rows[0].id);
      created = true;
    }

    // ── Channels ────────────────────────────────────────────────────────
    //
    // Each channel carries the URL that evidences it. The brief's domain
    // is the URL for any address that came off the brief itself — the
    // caller's corrections keep the same URL, because the URL evidences
    // that the PERSON exists at that company, not the exact string.
    const channels: Array<{
      channel_type: string; channel_value: string;
      channel_subtype: string; is_primary: boolean; source_url: string | null;
    }> = [];
    if (email) channels.push({ channel_type: 'email', channel_value: email, channel_subtype: 'work', is_primary: true, source_url: briefUrl });
    if (phone) channels.push({ channel_type: 'mobile', channel_value: phone, channel_subtype: 'work', is_primary: !email, source_url: briefUrl });
    if (linkedin) channels.push({ channel_type: 'linkedin', channel_value: linkedin, channel_subtype: 'work', is_primary: !email && !phone, source_url: null });

    for (const extra of params.extra_channels ?? []) {
      const type = String(extra.channel_type ?? '').trim().toLowerCase();
      const value = String(extra.channel_value ?? '').trim();
      if (!value) continue;
      if (!VALID_EXTRA_CHANNELS.has(type)) {
        throw new Error(`channel_type must be one of: ${[...VALID_EXTRA_CHANNELS].join(', ')}.`);
      }
      // Extras are human-typed. The caller vouches, so source_url stays NULL
      // — a human is the evidence, and pretending the brief evidenced an
      // address the brief did not contain would be a silent lie.
      channels.push({
        channel_type: type, channel_value: value,
        channel_subtype: 'work',
        is_primary: channels.length === 0,
        source_url: null,
      });
    }

    const written: Array<{ id: number; channel_type: string; channel_value: string; source_url: string | null }> = [];
    for (const c of channels) {
      // insert-channel.sql has ON CONFLICT DO NOTHING, so re-running the
      // promotion never duplicates a channel — the second call updates
      // source_url only if a URL is new and the row was previously bare.
      const r = await tx.query<{ id: string; channel_type: string; channel_value: string }>(
        INSERT_CHANNEL_SQL, {
          contact_id: contactId,
          tenant_id: ctx.tenant_id, is_live: ctx.is_live,
          channel_type: c.channel_type, channel_value: c.channel_value,
          channel_subtype: c.channel_subtype, is_primary: c.is_primary,
        },
      );
      if (r.rows[0] && c.source_url) {
        await tx.query(
          `UPDATE gt_contact_channels
              SET source_url = COALESCE(source_url, $source_url), updated_at = now()
            WHERE id = $id`,
          { id: Number(r.rows[0].id), source_url: c.source_url },
        );
        written.push({
          id: Number(r.rows[0].id), channel_type: r.rows[0].channel_type,
          channel_value: r.rows[0].channel_value, source_url: c.source_url,
        });
      } else if (r.rows[0]) {
        written.push({
          id: Number(r.rows[0].id), channel_type: r.rows[0].channel_type,
          channel_value: r.rows[0].channel_value, source_url: null,
        });
      }
    }

    // ── The gate ────────────────────────────────────────────────────────
    //
    // Only when the caller CONFIRMS. Promoting without confirming leaves
    // the journey where it was — this is the reviewer's ruling, not a
    // side effect of writing a contact row.
    //
    // Only move a journey that is actually WAITING for a person. From
    // `qualified` (or the states before it, if the reviewer skipped) the
    // move is forward and welcome; from anywhere past `addressed` it would
    // be silent regression, so it is refused rather than thrown — R-J5/R7
    // for the promotion path. The contact_id is written onto the journey
    // either way, because a journey knowing its person costs nothing and
    // pays off on every subsequent screen.
    let journeyState: string | null = null;
    let journeyMoved = false;
    if (wantsAddressed) {
      const before = await findJourney(tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live }, prospectId);
      const moved = await moveIfAt(
        tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live }, prospectId,
        ['sourced', 'researched', 'qualified'], 'addressed',
        {
          actor: 'human',
          actor_id: ctx.user_id,
          contact_id: contactId,
          payload: { brief_id: briefId, contact_id: contactId, named_index: idx },
        },
      );
      journeyState = moved?.state ?? before?.state ?? null;
      journeyMoved = moved !== null;
    } else if (created) {
      // Even without confirmation, wire the person onto the journey so it
      // no longer says "no contact yet" — a promoted-but-unconfirmed person
      // is still what the reviewer will confirm next, not a stranger.
      await tx.query(
        `UPDATE gt_journeys
            SET contact_id = COALESCE(contact_id, $contact_id::bigint), updated_at = now()
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
      created,
      channels_written: written,
      confirmed_addressed: wantsAddressed,
      journey_state: journeyState,
      journey_moved: journeyMoved,
      recipe: 'contact-detail' as const,
    };
  });
}

/** Trim, drop empties, and refuse the "not stated" idiom that came off the
 *  model — the extractor already reads that as an empty list, so it should
 *  never reach here, but a defence at the write boundary costs nothing. */
function normaliseChannel(kind: 'email' | 'mobile' | 'linkedin', v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^(not stated|not specified|not available|unknown|n\/?a|none|nil|null|-)$/i.test(s)) return null;
  if (kind === 'email' && !s.includes('@')) return null;
  return s;
}
