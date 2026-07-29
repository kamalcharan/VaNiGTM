/**
 * journey-skill: get_journey
 *
 * One journey, with its ledger.
 *
 * The events come back with the journey rather than from a second call
 * because the history IS the journey — a state with no account of how it got
 * there is the thing this table was built to stop being. Reading the current
 * state without the moves that produced it is how "no fit" ended up looking
 * like a judgement when it was actually a crash.
 *
 * Accepts `ref` (PROS-0042) alongside ids: raw PKs are never exposed in a
 * URL (CLAUDE.md).
 */

import { SkillContext } from '../../../shared/types';
import { OWED, allowedFrom, reasonRequired, type JourneyState } from '../states';

interface GetJourneyParams {
  journey_id?: number;
  prospect_id?: number;
  ref?: string;
}

export async function get_journey(params: GetJourneyParams, ctx: SkillContext) {
  const journeyId = Number(params.journey_id);
  const prospectId = Number(params.prospect_id);
  const ref = String(params.ref ?? '').trim();

  if (!Number.isFinite(journeyId) && !Number.isFinite(prospectId) && !ref) {
    throw new Error('journey_id, prospect_id or ref is required');
  }

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT j.id, j.prospect_id, j.arc, j.state, j.state_reason,
            j.entered_state_at, j.wake_at, j.owner_id, j.offer,
            j.contact_id, j.story_count, j.created_at,
            (j.wake_at IS NOT NULL AND j.wake_at <= now()) AS is_due,
            p.ref, p.name, p.website, p.city, p.industry_raw,
            c.full_name AS contact_name
       FROM gt_journeys j
       JOIN gt_prospects p ON p.id = j.prospect_id
       LEFT JOIN gt_contacts c ON c.id = j.contact_id
      WHERE j.tenant_id = $tenant_id
        AND j.is_live   = $is_live
        AND ($journey_id::bigint  IS NULL OR j.id          = $journey_id::bigint)
        AND ($prospect_id::bigint IS NULL OR j.prospect_id = $prospect_id::bigint)
        AND ($ref::text           IS NULL OR p.ref         = $ref::text)
      LIMIT 1`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      journey_id: Number.isFinite(journeyId) ? journeyId : null,
      prospect_id: Number.isFinite(prospectId) ? prospectId : null,
      ref: ref || null,
    },
  );

  const journey = res.rows[0];
  if (!journey) throw new Error('No journey for that company.');

  const events = await ctx.db.query<Record<string, unknown>>(
    `SELECT e.id, e.from_state, e.to_state, e.reason, e.actor, e.actor_id,
            e.payload, e.created_at
       FROM gt_journey_events e
      WHERE e.journey_id = $journey_id AND e.tenant_id = $tenant_id
      ORDER BY e.created_at DESC, e.id DESC
      LIMIT 200`,
    { journey_id: journey.id, tenant_id: ctx.tenant_id },
  );

  const state = journey.state as JourneyState;

  return {
    // Annotated because spreading a Record<string, unknown> alongside a known
    // key narrows the result to just that key, which then hides every real
    // column from callers.
    journey: {
      ...journey,
      // node-pg returns BIGINT as a string; callers comparing these to a
      // number would silently never match.
      id: Number(journey.id),
      prospect_id: Number(journey.prospect_id),
      contact_id: journey.contact_id === null ? null : Number(journey.contact_id),
      owed: OWED[state] ?? null,
    } as Record<string, unknown>,
    events: events.rows,
    /**
     * What this journey may do next, computed from the state machine rather
     * than hardcoded in the UI. A screen offering a move the server will
     * reject is worse than one that never offered it.
     */
    moves: allowedFrom(state).map((to) => ({
      to,
      owed: OWED[to],
      reason_required: reasonRequired(state, to),
    })),
    recipe: 'journey-detail' as const,
  };
}
