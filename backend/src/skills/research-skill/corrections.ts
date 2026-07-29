/**
 * VaNi GTM — the correction loop
 *
 * What a reviewer has already decided, handed back to the fit-scoring stage
 * as worked examples.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────
 *
 * The first pilot run put almost every pharma manufacturer on the same offer.
 * Some of that was fixable in code (order, and the smallest-ask rule —
 * migration 212); the rest is judgement that lives in the reviewer's head and
 * nowhere else. They rule a company out as "too small, single unit"; they move
 * another off the retainer onto the audit. Today that knowledge dies in a
 * `decision_note` column nobody reads twice.
 *
 * So the fit prompt gets to see it: the last handful of rulings, each with the
 * company, what the agent proposed, what the human settled on, and the human's
 * own words.
 *
 * ── WHAT THIS IS NOT ──────────────────────────────────────────────────
 *
 * It is not training, not statistics, and not a rule. At a hundred companies
 * ten examples are a DEMONSTRATION of how this reviewer thinks — and the
 * prompt says exactly that, because a model told "here are ten rejections"
 * will cheerfully reject everything. The balance is deliberate: disagreements
 * are what carry information, but confirmations go in too, or the loop only
 * ever teaches the model to say no.
 *
 * It is also not silent. A new ruling changes the judgement fingerprint, so
 * the Research screen shows "N re-scoring against your current offers and
 * corrections" BEFORE the button is pressed. Nothing re-scores on its own.
 *
 * ── WHAT IT NEVER TOUCHES ─────────────────────────────────────────────
 *
 * A brief a human has already decided is never re-judged (account.agent.ts).
 * Their ruling stands until they change it. Re-scoring a decision and quietly
 * moving the offer underneath it would be the exact silent overwrite that
 * migration 213 exists to stop.
 */

import { createHash } from 'crypto';
import type { SkillDb } from '../../types/skill.types';
import { lessonText, type Lesson } from './lessons';

/** How many of each kind reach the prompt. Enough to show a pattern, few
 *  enough that the model still reads the company in front of it. */
export const MAX_DISAGREEMENTS = 8;
export const MAX_CONFIRMATIONS = 4;

export interface Correction {
  company: string;
  what_they_make: string | null;
  scale_signals: string | null;
  /** What the agent proposed. */
  agent_offer: string | null;
  /** What the reviewer settled on — null when they ruled the company out. */
  human_offer: string | null;
  decision: string;
  note: string | null;
  decided_at: string;
}

interface CorrectionRow extends Omit<Correction, 'decided_at'> {
  decided_at: Date | string;
  kind: 'disagreement' | 'confirmation';
}

export interface CorrectionSet {
  disagreements: Correction[];
  confirmations: Correction[];
}

/**
 * The most recent rulings worth showing, split by whether the human agreed.
 *
 * A "disagreement" is a company ruled out, or approved under a different
 * offer than the agent proposed. A "confirmation" is a plain approval. They
 * are capped separately on purpose — take the ten most recent rulings
 * outright and a bad afternoon of rejections becomes the model's entire
 * picture of what this reviewer wants.
 */
export async function readCorrections(
  db: SkillDb,
  tenantId: string,
  isLive: boolean,
): Promise<CorrectionSet> {
  const res = await db.query<CorrectionRow>(
    `WITH ruled AS (
        SELECT p.name                                AS company,
               b.what_they_make,
               b.scale_signals,
               b.recommended_offer                   AS agent_offer,
               b.human_offer,
               b.status                              AS decision,
               b.decision_note                       AS note,
               b.decided_at,
               CASE WHEN b.status IN ('rejected','no_contact')
                      OR (b.human_offer IS NOT NULL
                          AND b.human_offer IS DISTINCT FROM b.recommended_offer)
                    THEN 'disagreement' ELSE 'confirmation' END AS kind,
               row_number() OVER (
                   PARTITION BY CASE WHEN b.status IN ('rejected','no_contact')
                                       OR (b.human_offer IS NOT NULL
                                           AND b.human_offer IS DISTINCT FROM b.recommended_offer)
                                     THEN 'disagreement' ELSE 'confirmation' END
                   ORDER BY b.decided_at DESC, b.id DESC) AS rn
          FROM gt_account_briefs b
          JOIN gt_prospects p
                ON p.id        = b.prospect_id
               AND p.tenant_id = $tenant_id
               AND p.is_live   = $is_live
         WHERE b.tenant_id  = $tenant_id
           AND b.is_live    = $is_live
           AND b.decided_at IS NOT NULL
           -- Nothing to learn from a company whose site we could not read:
           -- the ruling is about our pipeline, not about them.
           AND b.status NOT IN ('unreadable','extract_failed')
     )
     SELECT * FROM ruled
      WHERE (kind = 'disagreement'  AND rn <= $max_dis)
         OR (kind = 'confirmation'  AND rn <= $max_conf)
      ORDER BY decided_at DESC`,
    {
      tenant_id: tenantId, is_live: isLive,
      max_dis: MAX_DISAGREEMENTS, max_conf: MAX_CONFIRMATIONS,
    },
  );

  const norm = (r: CorrectionRow): Correction => ({
    company: r.company,
    what_they_make: r.what_they_make,
    scale_signals: r.scale_signals,
    agent_offer: r.agent_offer,
    human_offer: r.human_offer,
    decision: r.decision,
    note: r.note,
    decided_at: new Date(r.decided_at).toISOString(),
  });

  return {
    disagreements: res.rows.filter((r) => r.kind === 'disagreement').map(norm),
    confirmations: res.rows.filter((r) => r.kind === 'confirmation').map(norm),
  };
}

const trim = (s: string | null, n: number): string =>
  !s ? 'not stated' : (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * The corrections as the fit prompt sees them.
 *
 * Every framing choice here is defensive. The header says how many examples
 * there are and that they are examples — a model shown eight rejections and
 * no context will infer "reject things". The instruction is to apply the
 * REASONING, not to match the outcome, because the next company is not one of
 * these eight. And a reviewer's note is quoted verbatim rather than
 * paraphrased: "single unit, no exports" is a rule they can recognise and
 * argue with when they read the prompt back.
 */
export function correctionsForPrompt(
  set: CorrectionSet,
  offerName: (key: string | null) => string,
): string {
  const total = set.disagreements.length + set.confirmations.length;
  if (total === 0) return '';

  const one = (c: Correction): string => {
    const said = c.agent_offer ? offerName(c.agent_offer) : 'no fit';
    const did = c.decision === 'approved'
      ? `approved under ${offerName(c.human_offer ?? c.agent_offer)}`
      : (c.decision === 'no_contact' ? 'ruled out — do not contact' : 'rejected');
    return [
      `- ${c.company} (${trim(c.what_they_make, 120)}; scale: ${trim(c.scale_signals, 80)})`,
      `  agent proposed: ${said}`,
      `  reviewer: ${did}`,
      c.note ? `  reviewer's words: "${c.note}"` : null,
    ].filter(Boolean).join('\n');
  };

  const parts = [
    `HOW THIS REVIEWER HAS ACTUALLY DECIDED (${total} recent example`
    + `${total === 1 ? '' : 's'}):`,
    '',
    'These are examples of judgement, NOT a rule and NOT a quota. The company '
    + 'you are scoring now is not one of them. Apply the REASONING you can see '
    + 'in the reviewer\'s words — the size, the evidence, the kind of problem '
    + 'they thought was real — and ignore the tally of yes versus no.',
  ];

  if (set.disagreements.length > 0) {
    parts.push('', 'Where the reviewer disagreed with the agent:',
      ...set.disagreements.map(one));
  }
  if (set.confirmations.length > 0) {
    parts.push('', 'Where the reviewer agreed:', ...set.confirmations.map(one));
  }

  return parts.join('\n');
}

/**
 * Which set of prior judgement a brief was scored against — the ratified
 * lessons AND the raw rulings shown as examples.
 *
 * Pairs with catalogueFingerprint: together they say "this brief was judged
 * against THESE offers and THIS much of what you have taught it". Ratify a
 * lesson or rule on a company and the hash moves, so every UNDECIDED brief
 * becomes stale and the Research screen offers to re-score it — one LLM call
 * each, no crawling (migration 211). Decided briefs are never re-judged.
 *
 * Hashed over the content, not timestamps, so re-saving the same ruling with
 * the same words is correctly a no-op.
 */
export function correctionsFingerprint(
  set: CorrectionSet,
  lessons: Pick<Lesson, 'lesson' | 'edited_lesson' | 'kind' | 'applies_to'>[] = [],
): string {
  const material = [
    ...[...set.disagreements, ...set.confirmations]
      .map((c) => [c.company, c.agent_offer, c.human_offer, c.decision, c.note].join('~')),
    ...lessons.map((l) => ['LESSON', l.kind, l.applies_to, lessonText(l)].join('~')),
  ].sort().join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 32);
}

/**
 * The one fingerprint a brief is stamped with: offers AND corrections.
 *
 * Stored in `gt_account_briefs.offers_fingerprint` (the column name predates
 * corrections). Either input moving makes an undecided judgement stale.
 */
export function judgementFingerprint(
  catalogue: string,
  corrections: string,
): string {
  return createHash('sha256')
    .update(`${catalogue}|${corrections}`)
    .digest('hex')
    .slice(0, 64);
}
