/**
 * research-skill: log_touch
 *
 * Record that you actually contacted someone.
 *
 * Manual by design (POA Step 5). The pilot tests whether the BRIEF enables a
 * good message, not whether an LLM can write one — so a human writes and
 * sends, and this is the record that it happened.
 */

import { SkillContext } from '../../../shared/types';
import { CHANNELS, isChannel } from '../touches';
import { moveByProspect } from '../../journey-skill/journey.service';

interface LogTouchParams {
  prospect_id: number;
  channel: string;
  /**
   * WHO was written to. Optional so existing callers keep working, but
   * without it the cadence governor cannot see this send — fatigue belongs
   * to a person, and an unattributed touch is invisible to the cap.
   */
  contact_id?: number;
  /** Consume this held slot. Found by contact + channel when not given. */
  reservation_id?: number;
  /**
   * The story this send is carrying. Must be `approved` for this journey.
   * Recorded on the touch AND marks the story `sent`, so "reply rate per
   * story" is a query and Phase 6's human-baseline comparison is possible.
   */
  story_id?: number;
  offer?: string;
  /** Defaults to now. Set it when logging something sent yesterday. */
  touched_at?: string;
  notes?: string;
}

export async function log_touch(params: LogTouchParams, ctx: SkillContext) {
  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(prospectId)) throw new Error('prospect_id is required');
  if (!isChannel(params.channel)) {
    throw new Error(`channel must be one of: ${CHANNELS.join(', ')}.`);
  }

  return ctx.db.transaction(async (tx) => {
    // The company must be ours. tenant_id in the WHERE clause IS the
    // authorisation, and it also stops a touch being logged against a
    // prospect id that belongs to somebody else.
    const owned = await tx.query<{ id: number; researched: boolean }>(
      `SELECT p.id,
              EXISTS (SELECT 1 FROM gt_account_briefs b
                       WHERE b.prospect_id = p.id
                         AND b.tenant_id   = $tenant_id
                         AND b.is_live     = $is_live
                         AND b.facts_at IS NOT NULL) AS researched
         FROM gt_prospects p
        WHERE p.id = $prospect_id
          AND p.tenant_id = $tenant_id
          AND p.is_live   = $is_live`,
      { prospect_id: prospectId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (owned.rows.length === 0) throw new Error('No such company.');

    // The person must be ours too. Without this a valid contact id from
    // another tenant would be written onto our touch log.
    const contactId = Number.isFinite(Number(params.contact_id))
      ? Number(params.contact_id) : null;
    if (contactId !== null) {
      const c = await tx.query(
        `SELECT 1 FROM gt_contacts
          WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live`,
        { id: contactId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
      );
      if (c.rows.length === 0) throw new Error('No such contact.');
    }

    // The story, if given, must be an APPROVED one for this prospect. That
    // check is what turns story_id from "any bigint the caller typed" into
    // an audit trail — you cannot send a draft, and you cannot record a
    // story that belongs to somebody else's journey.
    const storyId = Number.isFinite(Number(params.story_id))
      ? Number(params.story_id) : null;
    let storyOffer: string | null = null;
    if (storyId !== null) {
      const s = await tx.query<{ offer: string | null }>(
        `SELECT s.offer FROM gt_journey_stories s
           JOIN gt_journeys j ON j.id = s.journey_id
          WHERE s.id = $id AND s.tenant_id = $tenant_id AND s.is_live = $is_live
            AND s.status = 'approved'
            AND j.prospect_id = $prospect_id`,
        {
          id: storyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live,
          prospect_id: prospectId,
        },
      );
      if (!s.rows[0]) {
        throw new Error(
          'The story does not belong to this journey, is not approved, or does not exist.',
        );
      }
      storyOffer = s.rows[0].offer;
    }

    const res = await tx.query<{ id: number; had_brief: boolean }>(
      `INSERT INTO gt_touch_log
         (tenant_id, is_live, prospect_id, contact_id, story_id, offer, channel, touched_at,
          notes, had_brief, created_by)
       VALUES
         ($tenant_id, $is_live, $prospect_id, $contact_id::bigint, $story_id::bigint,
          $offer, $channel, COALESCE($touched_at::timestamptz, now()),
          $notes, $had_brief, $user_id)
       RETURNING id, had_brief`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live, prospect_id: prospectId,
        contact_id: contactId,
        story_id: storyId,
        // If a story is carrying, its offer is the record. Otherwise fall
        // back to the caller — a phone note may name an offer even with no
        // story artifact behind it.
        offer: storyOffer ?? (String(params.offer ?? '').trim() || null),
        channel: params.channel,
        touched_at: params.touched_at ?? null,
        notes: String(params.notes ?? '').trim() || null,
        // Frozen NOW. Deriving it at read time would move the researched
        // denominator every time a brief is deleted or re-run — and both have
        // already happened in this pilot.
        had_brief: owned.rows[0].researched,
        user_id: ctx.user_id,
      },
    );

    // Consume the reservation this send was planned against, so the slot
    // stops blocking the next one. Named id first; otherwise the earliest
    // held slot for this person on this channel.
    //
    // A send with no reservation is NOT an error — somebody wrote by hand,
    // which is legitimate. The touch still lands in gt_touch_log and so
    // still counts against the cap; the governor sees it either way.
    let consumed: number | null = null;
    if (contactId !== null) {
      const r = await tx.query<{ id: string }>(
        `UPDATE gt_touch_reservations
            SET status = 'sent', touch_id = $touch_id::bigint, updated_at = now()
          WHERE id = (
            SELECT id FROM gt_touch_reservations
             WHERE tenant_id = $tenant_id AND is_live = $is_live
               AND contact_id = $contact_id AND status = 'held'
               AND ($reservation_id::bigint IS NULL OR id = $reservation_id::bigint)
               AND ($reservation_id::bigint IS NOT NULL OR channel = $channel)
             ORDER BY scheduled_at
             LIMIT 1)
          RETURNING id::text`,
        {
          tenant_id: ctx.tenant_id, is_live: ctx.is_live, contact_id: contactId,
          reservation_id: Number.isFinite(Number(params.reservation_id))
            ? Number(params.reservation_id) : null,
          channel: params.channel,
          touch_id: Number(res.rows[0].id),
        },
      );
      consumed = r.rows[0] ? Number(r.rows[0].id) : null;
    }

    // Mark the story sent. The CHECK constraint on gt_journey_stories
    // requires sent_as_touch and sent_at to move together, so this cannot
    // become a half-written state even if it somehow rolled back after
    // this line — the transaction is atomic, and the constraint refuses
    // any other shape at row level.
    if (storyId !== null) {
      await tx.query(
        `UPDATE gt_journey_stories
            SET status = 'sent',
                sent_as_touch = $touch_id::bigint,
                sent_at = now(),
                updated_at = now()
          WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live`,
        {
          id: storyId, touch_id: Number(res.rows[0].id),
          tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        },
      );
    }

    // The journey moves with the touch, in the same transaction. A send that
    // committed while the journey stayed at `ready` would leave the ledger
    // quietly wrong, and the ledger is the thing everything downstream reads.
    //
    // Forward skips are legal here on purpose: somebody who emailed a company
    // without walking it through the states still moved that relationship,
    // and refusing the move would only make the record lie about it.
    //
    // `reason` is always supplied, not just when required: answered → waiting
    // is BACKWARD on the ladder (states.ts's LADDER ranks answered above
    // waiting — "another round" costs ground the same way any other retreat
    // does), so states.reasonRequired() demands one there, and a touch logged
    // on a replied-to account is an entirely ordinary "Mark as contacted"
    // action, not an edge case that should throw. Harmless to pass on the
    // forward moves too — it lands in state_reason either way and reads fine.
    const journey = await moveByProspect(
      tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live }, prospectId, 'waiting',
      {
        actor: 'human',
        actor_id: ctx.user_id,
        reason: `Logged a touch via ${params.channel}`,
        offer: String(params.offer ?? '').trim() || null,
        payload: { touch_id: Number(res.rows[0].id), channel: params.channel },
      },
    );

    return {
      touch_id: Number(res.rows[0].id),
      had_brief: res.rows[0].had_brief,
      contact_id: contactId,
      story_id: storyId,
      reservation_consumed: consumed,
      journey_state: journey?.state ?? 'waiting',
      message: res.rows[0].had_brief
        ? 'Logged as a researched send — it counts toward the pilot criteria.'
        : 'Logged. This company has no brief, so it sits OUTSIDE the researched '
          + 'denominator — which is what makes the comparison worth anything.',
      recipe: 'touch-card' as const,
    };
  });
}
