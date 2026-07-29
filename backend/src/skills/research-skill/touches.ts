/**
 * The touch log — shared vocabulary and the response window.
 *
 * Kept out of the functions so the scoreboard and the logger cannot disagree
 * about what counts as a reply. A rate whose numerator and denominator are
 * defined in two files is a rate nobody should quote.
 */

export const CHANNELS = ['email', 'phone', 'linkedin', 'whatsapp', 'other'] as const;
export type Channel = (typeof CHANNELS)[number];

export const OUTCOMES = [
  'replied', 'meeting', 'not_interested', 'bounced', 'no_response',
] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const isChannel = (v: unknown): v is Channel =>
  typeof v === 'string' && (CHANNELS as readonly string[]).includes(v);
export const isOutcome = (v: unknown): v is Outcome =>
  typeof v === 'string' && (OUTCOMES as readonly string[]).includes(v);

/**
 * What counts as a reply.
 *
 * `not_interested` IS a reply. That is deliberate and it matters: the thesis
 * being tested is that researched outreach EARNS A RESPONSE, not that it wins
 * deals. A clear no is the audience engaging with the message; counting it as
 * silence would flatter the channel and hide the offer problem underneath.
 *
 * `bounced` is not a reply and is not a rejection either — it never reached
 * them. It is a reachability failure, which the plan names as the least-tested
 * assumption in the whole thesis, so it is counted on its own.
 */
export const REPLY_OUTCOMES: Outcome[] = ['replied', 'meeting', 'not_interested'];

/**
 * How long a send waits before silence counts as an answer.
 *
 * From the plan's own timeline ("send + response window: 2 weeks"). Written
 * here rather than typed into a query, because moving this number moves the
 * reply rate — and a criterion that can be tuned after seeing the result is
 * not a pre-registered criterion.
 */
export const RESPONSE_WINDOW_DAYS = 14;

/**
 * Below this, the rate is a number but not a reading.
 *
 * The plan says 45 sends yields a signal, not statistics. Twenty is the point
 * below which a single reply moves the rate by five percentage points and can
 * cross a verdict boundary on its own — so the scoreboard refuses to name a
 * verdict rather than offering one that a single email could overturn.
 */
export const MIN_CONCLUDED_FOR_VERDICT = 20;

export type Verdict = 'validated' | 'needs_work' | 'do_not_build' | 'too_early';

/**
 * The pre-registered criteria, in code, exactly as written in the plan before
 * anything was built:
 *
 *   ≥ 8%    thesis validated — build the machinery
 *   3 – 8%  something is there; offer or channel needs work before automating
 *   < 3%    the problem is offer-market fit or channel, NOT process —
 *           do NOT build agents
 *
 * The whole value of pre-registering is that this function was written from
 * the plan and not from the data. If these numbers are ever edited, the
 * pre-registration is void and the run has to be treated as exploratory.
 */
export function verdictFor(replyRate: number, concluded: number): Verdict {
  if (concluded < MIN_CONCLUDED_FOR_VERDICT) return 'too_early';
  if (replyRate >= 0.08) return 'validated';
  if (replyRate >= 0.03) return 'needs_work';
  return 'do_not_build';
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  validated: 'Thesis validated — researched outreach earns replies at the rate '
    + 'the plan pre-registered. Build the machinery.',
  needs_work: 'Something is there, but not enough. The offer or the channel '
    + 'needs work before any of this is automated.',
  do_not_build: 'Below the floor. The plan pre-registered this as offer-market '
    + 'fit or channel — NOT process — and said explicitly: do not build agents '
    + 'on this result.',
  too_early: 'Not enough concluded sends to read against the criteria yet.',
};
