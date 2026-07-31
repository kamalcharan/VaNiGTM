/**
 * story-skill: recommend_topic
 *
 * The "AI recommends topic and context, human writes the words" half of
 * the Phase 3 ruling. Reads the journey's brief, offer, contact and
 * earlier stories and returns a SHELL the human writes into — the topic,
 * what to open on, what evidence to cite, what argument to make, and what
 * NOT to repeat.
 *
 * ── DELIBERATELY DETERMINISTIC ────────────────────────────────────────
 *
 * No LLM at pilot scale. Every suggestion comes from data the reviewer
 * can inspect one screen away — the brief's evidence lines, the decided
 * offer, the journey's story count. When the LLM lands in Phase 6 it
 * fits into this same response shape; the prose gets better, the shape
 * does not change.
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────
 *
 * Writes no prose. Names each PART of a message (opening, argument, ask)
 * and leaves the words to the human. That is the whole ruling — a
 * scaffold is guidance, a full draft is prose, and the two are worth
 * building at different scales of reply data.
 */

import { SkillContext } from '../../../shared/types';

interface Params { journey_id: number }

interface RawEvidence { claim?: string; url?: string; excerpt?: string }

/**
 * One line per offer: how to POSITION it given the pain the brief found.
 * Written this way rather than as a prompt, because a template answer at
 * n=0 is more honest than an LLM answer against nothing.
 */
const OFFER_ANGLE: Record<string, string> = {
  'caio-as-a-service':
    'A fractional CAIO sits alongside the team on the very pattern the '
    + 'brief describes. Not a project — a person, embedded, weekly.',
  'cdo-as-a-service':
    'A fractional CDO owns the data pattern the brief called out. '
    + 'A named senior, not a consulting engagement.',
  'ai-automations':
    'Automate the specific workflow the brief called out. Measured '
    + 'payback, not a project. Six weeks to first result.',
};

export async function recommend_topic(params: Params, ctx: SkillContext) {
  const journeyId = Number(params.journey_id);
  if (!Number.isFinite(journeyId)) throw new Error('journey_id is required');

  // Journey + brief + contact + story count, in one round-trip so the
  // recommender is one call from the compose surface.
  const res = await ctx.db.query<{
    prospect_id: string; state: string; offer: string | null;
    story_count: string;
    company: string;
    contact_name: string | null; contact_title: string | null;
    brief_id: string | null;
    hook: string | null;
    raw_evidence: RawEvidence[] | null;
  }>(
    `SELECT j.prospect_id::text, j.state, j.offer, j.story_count::text,
            p.name AS company,
            c.name AS contact_name, c.job_title AS contact_title,
            b.id::text AS brief_id, b.hook, b.raw_evidence
       FROM gt_journeys j
       JOIN gt_prospects p ON p.id = j.prospect_id
       LEFT JOIN gt_contacts c ON c.id = j.contact_id
       LEFT JOIN LATERAL (
         SELECT id, hook, raw_evidence
           FROM gt_account_briefs ab
          WHERE ab.prospect_id = j.prospect_id
            AND ab.tenant_id   = j.tenant_id
            AND ab.is_live     = j.is_live
          ORDER BY ab.updated_at DESC LIMIT 1
       ) b ON true
      WHERE j.id = $journey_id
        AND j.tenant_id = $tenant_id AND j.is_live = $is_live`,
    { journey_id: journeyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );

  if (!res.rows[0]) throw new Error('No such journey.');
  const row = res.rows[0];

  const evidence = Array.isArray(row.raw_evidence)
    ? row.raw_evidence.filter((e) => e?.claim && e?.url) : [];

  // No evidence → no recommendation, but the response says WHY rather than
  // erroring. The compose UI reads this to decide whether to show the shell.
  if (evidence.length === 0) {
    return {
      journey_id: journeyId,
      ready: false,
      reason: 'This journey has no evidence yet. Research the company first — '
        + 'a story with nothing to trace to is a template with a name on it.',
      recipe: 'story-recommendation' as const,
    };
  }

  // Earlier story bodies — for R-S2 ("don't repeat what story 1 already said"),
  // and to pick an OPENER that has not already been used.
  const stories = await ctx.db.query<{ seq: number; subject: string | null; body: string }>(
    `SELECT seq, subject, body FROM gt_journey_stories
      WHERE journey_id = $journey_id
        AND tenant_id = $tenant_id AND is_live = $is_live
        AND status IN ('draft','approved','sent')
      ORDER BY seq`,
    { journey_id: journeyId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );

  // ── Pick the strongest UNUSED evidence line to open on ─────────────
  //
  // "Strongest" here means specificity — numbers, proper nouns, length.
  // "Unused" means no earlier story on this journey shared enough words
  // with it to have already cited it. Both are heuristics the reviewer
  // can inspect and override; both fail loudly (empty fresh set → fall
  // back to all evidence rather than say nothing).
  const alreadyCited = new Set(stories.rows.flatMap((s) => citedClaims(s.body, evidence)));
  const fresh = evidence.filter((e) => !alreadyCited.has(String(e.claim)));
  const pool = fresh.length > 0 ? fresh : evidence;

  const opener = pool
    .map((e) => ({ e, score: specificity(String(e.claim ?? '')) }))
    .sort((a, b) => b.score - a.score)[0]!.e;

  // Up to two more distinct evidence lines as supporting cites.
  const support = pool.filter((e) => e !== opener).slice(0, 2);

  // ── The argument ───────────────────────────────────────────────────
  const offer = row.offer ?? null;
  const angle = offer && OFFER_ANGLE[offer]
    ? OFFER_ANGLE[offer]
    : offer
      ? `Position ${offer} against the specific pattern above — not the category.`
      : 'No offer decided for this journey yet. Rule on the brief first.';

  // ── The ask — different for story 1 vs 2+ ─────────────────────────
  const storyN = Number(row.story_count) + 1;
  const ask = storyN === 1
    ? 'Worth fifteen minutes this week?'
    : storyN === 2
      ? 'Given the reply, could we put fifteen minutes on the calendar?'
      : 'A short call to sketch what the first four weeks would look like?';

  // ── Subject suggestion ─────────────────────────────────────────────
  const suggestedSubject = makeSubject(String(opener.claim ?? ''));

  return {
    journey_id: journeyId,
    ready: true,
    company: row.company,
    contact: row.contact_name
      ? { name: row.contact_name, title: row.contact_title } : null,
    offer,
    story_seq: storyN,
    /** The line the compose surface shows big at the top. */
    headline: opener.claim,
    /** URL that headline traces to — the reviewer can click straight to source. */
    headline_url: opener.url,
    /** How to position the offer, in one line. */
    angle,
    /** The closing ask, staged by story number. */
    ask,
    /** Every evidence line the recommender picked, in order of intended use. */
    cited_evidence: [opener, ...support].map((e) => ({ claim: e.claim, url: e.url })),
    /** What NOT to repeat — earlier stories on this journey. */
    already_said: stories.rows.map((s) => ({
      seq: s.seq, subject: s.subject,
      snippet: (s.body ?? '').slice(0, 180),
    })),
    /** Suggested subject line the human may keep or change. */
    suggested_subject: suggestedSubject,
    recipe: 'story-recommendation' as const,
  };
}

/* ── Heuristics ─────────────────────────────────────────────────────── */

/** Numbers and proper nouns count most; length as tiebreaker. */
function specificity(claim: string): number {
  const numbers = (claim.match(/\d+/g) ?? []).length;
  const nouns = (claim.match(/\b[A-Z][a-z]/g) ?? []).length;
  return numbers * 3 + nouns * 2 + Math.min(claim.length / 40, 2);
}

/** Which evidence lines does this story body appear to have cited? Same
 *  Jaccard-style shared-term test as trace.ts — kept simple so the reviewer
 *  can predict what the recommender will avoid. */
function citedClaims(body: string, evidence: RawEvidence[]): string[] {
  const bodyTerms = new Set(
    body.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3),
  );
  return evidence
    .filter((e) => {
      const et = String(e.claim ?? '').toLowerCase()
        .split(/[^a-z0-9]+/).filter((w) => w.length > 3);
      if (et.length === 0) return false;
      const shared = et.filter((w) => bodyTerms.has(w));
      return shared.length / et.length >= 0.4;
    })
    .map((e) => String(e.claim));
}

/** Trim a suggested subject to something a mail client will render nicely. */
function makeSubject(claim: string): string {
  const s = claim.replace(/[.,]+$/, '');
  return s.length <= 60 ? s : `${s.slice(0, 57)}…`;
}
