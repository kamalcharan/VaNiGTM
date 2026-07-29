/**
 * journey-skill: advance_journey
 *
 * A human moving a journey.
 *
 * Every move — forward, backward, park, rule out, won — comes through here.
 * There is no separate "park" endpoint because parking is not a different
 * kind of act, it is a move to `parked` that happens to carry a date, and
 * two endpoints would mean two places for the reason rule to be enforced.
 *
 * The rules live in states.ts and journey.service.ts. This function's whole
 * job is to be the authenticated door to them.
 */

import { SkillContext } from '../../../shared/types';
import { isState, STATES, type JourneyState } from '../states';
import { findJourney, ensureJourney, moveJourney } from '../journey.service';

interface AdvanceJourneyParams {
  journey_id?: number;
  prospect_id?: number;
  to: string;
  reason?: string;
  /** Parked journeys only. ISO date. */
  wake_at?: string;
  offer?: string;
  contact_id?: number;
}

export async function advance_journey(params: AdvanceJourneyParams, ctx: SkillContext) {
  const to = String(params.to ?? '').trim();
  if (!isState(to)) {
    throw new Error(`Unknown journey state "${to}". One of: ${STATES.join(', ')}`);
  }

  const journeyId = Number(params.journey_id);
  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(journeyId) && !Number.isFinite(prospectId)) {
    throw new Error('journey_id or prospect_id is required');
  }

  // A wake date in the past is almost always a typo, and a parked journey
  // that is due the moment it is parked defeats the point of parking it.
  let wakeAt: string | null = null;
  if (params.wake_at) {
    const t = new Date(params.wake_at);
    if (Number.isNaN(t.getTime())) throw new Error('wake_at is not a date');
    if (t.getTime() <= Date.now()) throw new Error('wake_at must be in the future');
    if (to !== 'parked') {
      throw new Error('wake_at applies to parked journeys only');
    }
    wakeAt = t.toISOString();
  }

  const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };

  return ctx.db.transaction(async (tx) => {
    let journey;
    if (Number.isFinite(journeyId)) {
      const res = await tx.query<{ prospect_id: number }>(
        `SELECT prospect_id FROM gt_journeys
          WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live`,
        { id: journeyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
      );
      // tenant_id + is_live in the WHERE ARE the authorisation — an id from
      // another tenant simply matches nothing.
      if (!res.rows[0]) throw new Error('No such journey.');
      journey = await findJourney(tx, scope, res.rows[0].prospect_id);
    } else {
      journey = await ensureJourney(tx, scope, prospectId);
    }
    if (!journey) throw new Error('No such journey.');

    const moved = await moveJourney(tx, scope, journey, to as JourneyState, {
      reason: params.reason,
      actor: 'human',
      actor_id: ctx.user_id,
      wake_at: wakeAt,
      offer: params.offer ?? null,
      contact_id: Number.isFinite(Number(params.contact_id))
        ? Number(params.contact_id) : null,
    });

    return {
      journey: moved ?? journey,
      // Distinguished so the UI can say "already there" rather than
      // reporting a move that did not happen as one that did.
      moved: moved !== null,
      recipe: 'journey-detail' as const,
    };
  });
}
