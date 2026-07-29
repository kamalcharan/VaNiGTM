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

    const res = await tx.query<{ id: number; had_brief: boolean }>(
      `INSERT INTO gt_touch_log
         (tenant_id, is_live, prospect_id, offer, channel, touched_at,
          notes, had_brief, created_by)
       VALUES
         ($tenant_id, $is_live, $prospect_id, $offer, $channel,
          COALESCE($touched_at::timestamptz, now()),
          $notes, $had_brief, $user_id)
       RETURNING id, had_brief`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live, prospect_id: prospectId,
        offer: String(params.offer ?? '').trim() || null,
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

    // The journey moves with the touch, in the same transaction. A send that
    // committed while the journey stayed at `ready` would leave the ledger
    // quietly wrong, and the ledger is the thing everything downstream reads.
    //
    // Forward skips are legal here on purpose: somebody who emailed a company
    // without walking it through the states still moved that relationship,
    // and refusing the move would only make the record lie about it.
    const journey = await moveByProspect(
      tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live }, prospectId, 'waiting',
      {
        actor: 'human',
        actor_id: ctx.user_id,
        offer: String(params.offer ?? '').trim() || null,
        payload: { touch_id: Number(res.rows[0].id), channel: params.channel },
      },
    );

    return {
      touch_id: Number(res.rows[0].id),
      had_brief: res.rows[0].had_brief,
      journey_state: journey?.state ?? 'waiting',
      message: res.rows[0].had_brief
        ? 'Logged as a researched send — it counts toward the pilot criteria.'
        : 'Logged. This company has no brief, so it sits OUTSIDE the researched '
          + 'denominator — which is what makes the comparison worth anything.',
      recipe: 'touch-card' as const,
    };
  });
}
