/**
 * research-skill: set_touch_outcome
 *
 * What came back.
 *
 * Separate from logging the send because they happen days apart, and because
 * the gap between them is the thing the response window measures.
 */

import { SkillContext } from '../../../shared/types';
import { OUTCOMES, isOutcome } from '../touches';
import { moveByProspect } from '../../journey-skill/journey.service';

interface SetOutcomeParams {
  touch_id: number;
  /** Pass null to undo — a mis-clicked outcome must be reversible. */
  outcome: string | null;
  notes?: string;
  /** When it came back. Defaults to now. */
  outcome_at?: string;
}

export async function set_touch_outcome(params: SetOutcomeParams, ctx: SkillContext) {
  const id = Number(params.touch_id);
  if (!Number.isFinite(id)) throw new Error('touch_id is required');

  const clearing = params.outcome === null || params.outcome === undefined
    || String(params.outcome).trim() === '';
  if (!clearing && !isOutcome(params.outcome)) {
    throw new Error(`outcome must be one of: ${OUTCOMES.join(', ')} — or empty to clear it.`);
  }

  return ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ id: number; outcome: string | null; prospect_id: number }>(
      // outcome and outcome_at move together — the CHECK constraint enforces
      // it, and "how long did it take" is the second question anyone asks
      // after the rate.
      `UPDATE gt_touch_log
          SET outcome    = $outcome::text,
              outcome_at = CASE WHEN $outcome::text IS NULL THEN NULL
                                ELSE COALESCE($outcome_at::timestamptz, now()) END,
              notes      = COALESCE(NULLIF($notes, ''), notes),
              updated_at = now()
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
        RETURNING id, outcome, prospect_id`,
      {
        id, outcome: clearing ? null : params.outcome,
        outcome_at: params.outcome_at ?? null,
        notes: String(params.notes ?? '').trim(),
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      },
    );
    if (res.rows.length === 0) throw new Error('No such touch.');

    // An answer is the event the whole journey has been waiting for — it is
    // what opens the stage decision (another story, advance, or stop). Moving
    // the journey here rather than on a later sweep means the decision is
    // owed the moment the answer is recorded.
    //
    // Clearing an outcome walks it back, which is a backward move and
    // therefore carries its reason (R-J1). A mis-clicked outcome must be
    // reversible without leaving the journey stranded at `answered`.
    const journey = await moveByProspect(
      tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live },
      Number(res.rows[0].prospect_id),
      clearing ? 'waiting' : 'answered',
      {
        actor: 'human',
        actor_id: ctx.user_id,
        reason: clearing ? 'Outcome cleared — back to waiting' : null,
        payload: { touch_id: id, outcome: res.rows[0].outcome },
      },
    );

    return {
      touch_id: id,
      outcome: res.rows[0].outcome,
      journey_state: journey?.state ?? null,
      recipe: 'touch-card' as const,
    };
  });
}
