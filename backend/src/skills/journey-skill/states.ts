/**
 * The journey state machine.
 *
 * One place, so the migration's CHECK constraint, the API, the agents and
 * the UI cannot each hold a slightly different opinion about what a journey
 * can do. Everything here is a plain value or a pure function — no database,
 * no context — so it is cheap to test exhaustively.
 *
 * Design: documents/design-notes-journey-campaign.md §1.
 */

/* ── The ladder ───────────────────────────────────────────────────────── */

/**
 * The states a journey climbs through, in order. The ordinal is what makes
 * "backward" a computable thing rather than a matter of opinion — and R-J1
 * (no silent regression) is defined in terms of it.
 */
export const LADDER = [
  'sourced',
  'researched',
  'qualified',
  'addressed',
  'ready',
  'waiting',
  'answered',
  'won',
] as const;

/**
 * Off-ladder ends. Three of them, deliberately, because they mean different
 * things and the difference IS the learning signal:
 *   ruled_out — never a fit
 *   parked    — a fit, wrong moment
 *   lost      — we played it out
 * Collapsing them into one "closed" would throw away the reason, which is
 * the only part the Learning Graph can eat.
 */
export const EXITS = ['ruled_out', 'parked', 'lost'] as const;

export const STATES = [...LADDER, ...EXITS] as const;

export type LadderState = (typeof LADDER)[number];
export type ExitState = (typeof EXITS)[number];
export type JourneyState = (typeof STATES)[number];

export type Arc = 'acquisition' | 'lifetime';
export type Actor = 'human' | 'agent' | 'system';

const RUNG = new Map<string, number>(LADDER.map((s, i) => [s, i]));

export function isState(s: string): s is JourneyState {
  return (STATES as readonly string[]).includes(s);
}

export function isExit(s: string): s is ExitState {
  return (EXITS as readonly string[]).includes(s);
}

/**
 * A move DOWN the ladder. Exits are not backward — they are sideways, and
 * they carry their own reason requirement.
 */
export function isBackward(from: JourneyState, to: JourneyState): boolean {
  const a = RUNG.get(from);
  const b = RUNG.get(to);
  return a !== undefined && b !== undefined && b < a;
}

/* ── What is owed ─────────────────────────────────────────────────────── */

/**
 * The one line the board shows next to each state. Phrased as a debt, not a
 * status, because a journey's whole purpose is to say what happens next.
 */
export const OWED: Record<JourneyState, string> = {
  sourced: 'Research this company',
  researched: 'Rule on the brief',
  qualified: 'Find the person',
  addressed: 'Write the story',
  ready: 'Send it',
  waiting: 'Wait for an answer',
  answered: 'Decide: another story, advance, or stop',
  won: 'Hand over to the lifetime arc',
  ruled_out: 'Nothing — ruled out',
  parked: 'Nothing until the wake date',
  lost: 'Nothing — closed',
};

/* ── Legal moves ──────────────────────────────────────────────────────── */

/**
 * Forward skips ARE legal (a human who emailed somebody outside the system
 * and logged the touch has genuinely moved that journey to `waiting`, and
 * refusing the move would only make the ledger lie). What is NOT legal is an
 * arbitrary edge — moving `ruled_out` straight to `waiting`, say, without
 * passing back through a re-qualification a human can see.
 */
const ALLOWED: Record<JourneyState, readonly JourneyState[]> = {
  sourced: ['researched', 'qualified', 'addressed', 'ready', 'waiting', 'ruled_out', 'parked'],
  researched: ['qualified', 'addressed', 'ready', 'waiting', 'sourced', 'ruled_out', 'parked'],
  qualified: ['addressed', 'ready', 'waiting', 'researched', 'ruled_out', 'parked', 'lost'],
  addressed: ['ready', 'waiting', 'qualified', 'parked', 'lost', 'ruled_out'],
  ready: ['waiting', 'addressed', 'parked', 'lost'],
  waiting: ['answered', 'ready', 'parked', 'lost'],
  // The loop. `answered → addressed` is "another story is owed" and is the
  // single most-travelled edge in a working journey.
  answered: ['addressed', 'ready', 'waiting', 'won', 'lost', 'parked'],
  // Re-entry from a park lands wherever the work actually resumes.
  parked: ['qualified', 'addressed', 'ready', 'researched', 'sourced', 'lost', 'ruled_out'],
  // Humans change their minds, and a ruling that cannot be undone is a
  // ruling people avoid making.
  ruled_out: ['qualified', 'researched', 'sourced'],
  lost: ['parked', 'qualified', 'addressed'],
  // Arc 2 owns everything past here (POA Phase 8). Deliberately empty
  // rather than guessed at.
  won: [],
};

export function canMove(from: JourneyState, to: JourneyState): boolean {
  return ALLOWED[from].includes(to);
}

export function allowedFrom(from: JourneyState): readonly JourneyState[] {
  return ALLOWED[from];
}

/**
 * R-J1 — no silent regression. A reason is demanded for every move that ends
 * the journey, loses ground, or REVERSES a judgement already written down —
 * and for nothing else.
 *
 * That third case is why `isExit(from)` is here and not just `isExit(to)`.
 * Coming back from `parked` or `ruled_out` contradicts a ruling somebody
 * made and recorded, and "why did this company come back" is a better
 * question than "why did it go away". Un-parking without a reason is how a
 * cohort quietly refills with companies that were rejected for good cause.
 *
 * Everything else stays silent on purpose: asking for a reason on routine
 * forward moves trains people to type "n/a", which fills the one column the
 * Learning Graph reads with noise.
 */
export function reasonRequired(from: JourneyState, to: JourneyState): boolean {
  return isExit(to) || isExit(from) || isBackward(from, to);
}

/**
 * R-J3 — a campaign may move a journey exactly twice in its life and never
 * anywhere else. Exported so Phase 4 enforces it against this list rather
 * than against a comment.
 */
export const CAMPAIGN_MOVES: ReadonlyArray<[JourneyState, JourneyState]> = [
  ['ready', 'waiting'],
  ['waiting', 'answered'],
];

export function isCampaignMove(from: JourneyState, to: JourneyState): boolean {
  return CAMPAIGN_MOVES.some(([f, t]) => f === from && t === to);
}

/** Winning is a doorway, not a terminus (design note §1.2). */
export function arcFor(to: JourneyState): Arc {
  return to === 'won' ? 'lifetime' : 'acquisition';
}
