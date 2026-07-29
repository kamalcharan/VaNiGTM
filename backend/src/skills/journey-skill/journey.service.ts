/**
 * Moving a journey.
 *
 * Every state change in the product goes through `moveJourney`. Not because
 * a UPDATE would be hard, but because a state change that does not write its
 * event is a lie the ledger cannot detect — and gt_journeys.state is only a
 * cache of gt_journey_events' tail (migration 222). One function writes both,
 * in one transaction, or neither.
 *
 * Callers pass their own `tx`. That is deliberate: when a human decides a
 * brief, the brief update and the journey move must commit together. A
 * journey that advanced for a decision that rolled back is exactly the kind
 * of quiet drift this table exists to prevent.
 */

import type { SkillDb } from '../../shared/types';
import {
  type JourneyState, type Actor, isState, canMove, reasonRequired, arcFor, allowedFrom,
} from './states';

export interface JourneyRow {
  id: number;
  prospect_id: number;
  arc: string;
  state: JourneyState;
  state_reason: string | null;
  entered_state_at: string;
  wake_at: string | null;
  owner_id: string | null;
  offer: string | null;
  contact_id: number | null;
  story_count: number;
}

interface Scope {
  tenant_id: string;
  is_live: boolean;
}

export interface MoveOptions {
  /** Required for exits and backward moves (R-J1). */
  reason?: string | null;
  actor?: Actor;
  actor_id?: string | null;
  /** Anything the ledger should remember: brief id, outcome, story id, run id. */
  payload?: Record<string, unknown>;
  /** Set alongside the move so the two commit together. */
  offer?: string | null;
  contact_id?: number | null;
  /** Parked journeys only; cleared automatically on any other target. */
  wake_at?: string | null;
  /** Bump story_count as part of this move. */
  incrementStories?: boolean;
}

/* ── Read ─────────────────────────────────────────────────────────────── */

/**
 * node-pg hands BIGINT back as a STRING, so a JourneyRow straight off the
 * driver has `id: "45"` while claiming `id: number`. Left alone that is a lie
 * the compiler cannot catch and `===` comparisons quietly fail on. Coerced
 * once, here, rather than at every call site that forgets.
 */
function normalise(row: JourneyRow): JourneyRow {
  return {
    ...row,
    id: Number(row.id),
    prospect_id: Number(row.prospect_id),
    contact_id: row.contact_id === null ? null : Number(row.contact_id),
    story_count: Number(row.story_count),
  };
}

export async function findJourney(
  db: SkillDb, scope: Scope, prospectId: number,
): Promise<JourneyRow | null> {
  const res = await db.query<JourneyRow>(
    `SELECT id, prospect_id, arc, state, state_reason, entered_state_at,
            wake_at, owner_id, offer, contact_id, story_count
       FROM gt_journeys
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND prospect_id = $prospect_id`,
    { tenant_id: scope.tenant_id, is_live: scope.is_live, prospect_id: prospectId },
  );
  return res.rows[0] ? normalise(res.rows[0]) : null;
}

/* ── Create ───────────────────────────────────────────────────────────── */

/**
 * The journey for a prospect, creating it at `sourced` if it does not exist.
 *
 * Every cohort member gets a journey (D6): the gap between sourced and
 * researched is a number worth being able to see, and it is only visible if
 * un-researched companies have a row.
 *
 * ON CONFLICT rather than check-then-insert — two imports landing the same
 * company concurrently must not race into a duplicate, and the unique index
 * is the only thing that can actually promise that.
 */
export async function ensureJourney(
  db: SkillDb, scope: Scope, prospectId: number,
): Promise<JourneyRow> {
  const existing = await findJourney(db, scope, prospectId);
  if (existing) return existing;

  const ins = await db.query<{ id: number }>(
    `INSERT INTO gt_journeys (tenant_id, is_live, prospect_id, state)
     VALUES ($tenant_id, $is_live, $prospect_id, 'sourced')
     ON CONFLICT (tenant_id, is_live, prospect_id) DO NOTHING
     RETURNING id`,
    { tenant_id: scope.tenant_id, is_live: scope.is_live, prospect_id: prospectId },
  );

  // Inserted — open the ledger. (No row back means someone else won the
  // race; their opening event is already there.)
  if (ins.rows[0]) {
    await db.query(
      `INSERT INTO gt_journey_events
         (tenant_id, is_live, journey_id, from_state, to_state, reason, actor, payload)
       VALUES ($tenant_id, $is_live, $journey_id, NULL, 'sourced',
               'Journey opened', 'system', '{}'::jsonb)`,
      {
        tenant_id: scope.tenant_id, is_live: scope.is_live,
        journey_id: ins.rows[0].id,
      },
    );
  }

  const row = await findJourney(db, scope, prospectId);
  if (!row) throw new Error('JOURNEY_CREATE_FAILED: no row after insert');
  return row;
}

/* ── Move ─────────────────────────────────────────────────────────────── */

/**
 * Move a journey and write its event, atomically.
 *
 * Returns null when the journey is ALREADY in the target state — a no-op,
 * not an error. Callers are frequently reacting to an event that may arrive
 * twice (a re-logged touch, a replayed bus message), and turning that into
 * a throw would make every caller wrap this in a try/catch that swallows
 * real failures too.
 */
export async function moveJourney(
  db: SkillDb,
  scope: Scope,
  journey: JourneyRow,
  to: JourneyState,
  opts: MoveOptions = {},
): Promise<JourneyRow | null> {
  if (!isState(to)) throw new Error(`Not a journey state: ${to}`);

  const from = journey.state;
  if (from === to) return null;

  if (!canMove(from, to)) {
    throw new Error(
      `ILLEGAL_JOURNEY_MOVE: ${from} → ${to}. `
      + `From ${from} a journey may go to: ${allowedFrom(from).join(', ') || '(nowhere — arc 2 owns it)'}.`,
    );
  }

  const reason = String(opts.reason ?? '').trim();
  if (reasonRequired(from, to) && reason.length < 3) {
    throw new Error(
      `REASON_REQUIRED: moving ${from} → ${to} loses ground or ends the journey. `
      + 'These reasons are the only thing the Learning Graph can read.',
    );
  }

  // wake_at belongs to parked journeys alone (CHECK in migration 222). Any
  // other target clears it rather than tripping the constraint.
  const wakeAt = to === 'parked' ? (opts.wake_at ?? null) : null;

  const upd = await db.query<JourneyRow>(
    `UPDATE gt_journeys
        SET state            = $to,
            state_reason     = NULLIF($reason, ''),
            entered_state_at = now(),
            arc              = $arc,
            wake_at          = $wake_at::timestamptz,
            offer            = COALESCE($offer, offer),
            contact_id       = COALESCE($contact_id::bigint, contact_id),
            story_count      = story_count + $story_bump::smallint,
            updated_at       = now()
      WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
        AND state = $from
      RETURNING id, prospect_id, arc, state, state_reason, entered_state_at,
                wake_at, owner_id, offer, contact_id, story_count`,
    {
      id: journey.id, tenant_id: scope.tenant_id, is_live: scope.is_live,
      // Guards against a concurrent mover: if someone else already moved
      // this journey, no row matches and we throw rather than overwrite.
      from,
      to, reason, arc: arcFor(to), wake_at: wakeAt,
      offer: opts.offer ?? null,
      contact_id: opts.contact_id ?? null,
      story_bump: opts.incrementStories ? 1 : 0,
    },
  );

  if (!upd.rows[0]) {
    throw new Error(
      `JOURNEY_MOVED_CONCURRENTLY: expected ${from}, someone else changed it first.`,
    );
  }

  await db.query(
    `INSERT INTO gt_journey_events
       (tenant_id, is_live, journey_id, from_state, to_state, reason,
        actor, actor_id, payload)
     VALUES ($tenant_id, $is_live, $journey_id, $from, $to, NULLIF($reason, ''),
             $actor, $actor_id::uuid, $payload::jsonb)`,
    {
      tenant_id: scope.tenant_id, is_live: scope.is_live,
      journey_id: journey.id, from, to, reason,
      actor: opts.actor ?? 'human',
      actor_id: opts.actor_id ?? null,
      payload: JSON.stringify(opts.payload ?? {}),
    },
  );

  return normalise(upd.rows[0]);
}

/**
 * Move by prospect, creating the journey first if needed.
 *
 * The convenience the rest of the codebase actually wants: `decide_brief`
 * and `log_touch` know a prospect id, not a journey id, and should not have
 * to care whether a journey row exists yet.
 */
export async function moveByProspect(
  db: SkillDb,
  scope: Scope,
  prospectId: number,
  to: JourneyState,
  opts: MoveOptions = {},
): Promise<JourneyRow | null> {
  const journey = await ensureJourney(db, scope, prospectId);
  return moveJourney(db, scope, journey, to, opts);
}

/**
 * Move only if the journey is in one of `only`; otherwise leave it alone and
 * return null.
 *
 * For side effects that SHOULD advance a journey that has not started, but
 * must NOT drag back one that has. Re-researching a company we already
 * emailed is the case that forced this: a fresh brief genuinely replaces the
 * knowledge, but it does not un-send the email, and yanking that journey
 * from `waiting` back to `researched` would be the system overwriting a real
 * event with a derived one.
 *
 * This is the same instinct as R7 — new work does not reach back and rewrite
 * what already happened.
 */
export async function moveIfAt(
  db: SkillDb,
  scope: Scope,
  prospectId: number,
  only: readonly JourneyState[],
  to: JourneyState,
  opts: MoveOptions = {},
): Promise<JourneyRow | null> {
  const journey = await ensureJourney(db, scope, prospectId);
  if (!only.includes(journey.state)) return null;
  return moveJourney(db, scope, journey, to, opts);
}
