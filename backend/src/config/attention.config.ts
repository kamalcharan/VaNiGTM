/**
 * VaNi GTM — /today ranking, as configuration.
 *
 * The work order asks for the ranking to be tunable without a schema change.
 * Everything a human might want to argue about lives here: how long silence
 * has to last before it counts, how much each kind of silence is worth, and
 * how many items a day is a reasonable ask.
 *
 * ── WHY NOT IN THE DATABASE ───────────────────────────────────────────
 *
 * A gt_attention_policy table is the obvious alternative and it is the wrong
 * trade today. Per-tenant tuning is not a requirement yet, and a table would
 * buy that at the cost of a migration, a settings screen and a second place
 * for the numbers to live. This is a diff, reviewable in a pull request,
 * with the reasoning attached — which is more than a row in a table gives
 * you. When the first tenant genuinely needs different numbers, this shape
 * moves into gt_cadence_policy's neighbourhood and the code reads the table
 * instead. The SQL already takes every number as a bound parameter, so that
 * change touches this file and nothing else.
 *
 * ── WHY THE SQL TAKES THESE AS PARAMETERS ─────────────────────────────
 *
 * Inlining them into the .sql file would put the tuning in two places and
 * make "what was the threshold last Tuesday" unanswerable. The query is a
 * pure function of these numbers, so a decision recorded with its `shown`
 * payload (migration 238) can be replayed against the weights that produced
 * it.
 */

/** Which journey states are candidates for attention at all.
 *
 *  Reasoning lives in docs/gtm/attention-query.md §5. In short: silence is
 *  only interesting for a relationship that is supposed to be moving.
 *  `sourced`/`researched` are the research queue, not the attention queue;
 *  `ruled_out`/`lost`/`won` are closed and silence is the correct state.
 *  `parked` is handled separately — it enters only when its wake date has
 *  passed, and then it is not a gap item at all. */
export const IN_PLAY_STATES = [
  'qualified',
  'addressed',
  'ready',
  'waiting',
  'answered',
] as const;

/** Why an account is on the list. Ordering here is deliberate: it is the
 *  tiebreak when two items score identically, most-owed first. */
export type AttentionReason =
  | 'wake_due'      // you asked to be reminded, and the date has passed
  | 'owed_reply'    // they answered; we have not come back
  | 'story_unsent'  // an approved story exists and was never sent
  | 'gone_quiet'    // touched, no answer, past the window
  | 'never_touched'; // in play, never contacted

export interface AttentionConfig {
  /** Silence shorter than this is not silence, it is a normal gap between
   *  touches. Set below the cadence governor's default window (7 days,
   *  migration 223) and /today would ask for a touch the governor would then
   *  refuse — the screen must not generate work the system will veto. */
  quiet_after_days: number;

  /** Above this, more silence stops meaning more urgency. Without a cap, a
   *  prospect uploaded eighteen months ago and never contacted outranks a
   *  live conversation that went cold on Tuesday, forever. The cap is what
   *  stops /today becoming a list of ancient rows sorted by age. */
  max_days_counted: number;

  /** Base score per reason, before the silence term. These set the coarse
   *  order; days_quiet only sorts within a band.
   *
   *  `owed_reply` outranks everything except an explicit reminder because a
   *  human replied and we did not answer, which is the most expensive kind
   *  of silence in the whole system. `never_touched` sits at the bottom:
   *  it is real work, but it is prospecting, and it must not bury the
   *  conversations already in flight. */
  reason_weight: Record<AttentionReason, number>;

  /** Added per day of silence, up to max_days_counted. Deliberately small
   *  relative to the reason weights — silence breaks ties inside a band, it
   *  does not promote across bands. */
  per_day_weight: number;

  /** Default when somebody snoozes without naming a date. */
  snooze_default_days: number;

  /** How many items /today asks for in one go. A queue nobody can finish is
   *  a queue nobody starts; this is a day's work, not an inbox. */
  page_size: number;

  /** Hard ceiling on what the API will return however the page size is
   *  requested, so a client cannot ask for the whole prospect table. */
  max_page_size: number;
}

export const ATTENTION_CONFIG: AttentionConfig = {
  quiet_after_days: 14,
  max_days_counted: 90,

  reason_weight: {
    wake_due:      1000,
    owed_reply:     800,
    story_unsent:   600,
    gone_quiet:     400,
    never_touched:  200,
  },

  per_day_weight: 1,

  snooze_default_days: 7,

  page_size: 15,
  max_page_size: 50,
};

/** Reasons in the order they break ties. Derived from the weights rather
 *  than written twice, so retuning cannot leave the two disagreeing. */
export const REASON_ORDER: AttentionReason[] =
  (Object.keys(ATTENTION_CONFIG.reason_weight) as AttentionReason[])
    .sort((a, b) =>
      ATTENTION_CONFIG.reason_weight[b] - ATTENTION_CONFIG.reason_weight[a]);
