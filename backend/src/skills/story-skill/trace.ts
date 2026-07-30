/**
 * The claim tracer.
 *
 * Pure functions, so R-S1 — every claim about the prospect traces to
 * evidence — can be tested exhaustively and cheaply.
 *
 * This is the compose prototype's rule, promoted to the write boundary.
 * The prototype learned two things worth remembering here:
 *
 *  1. It looks for INVENTED FACTS, not for unevidenced sentences. A
 *     greeting, a subject fragment, a question — those claim nothing and
 *     must not be flagged, or the tool cries wolf and gets switched off.
 *
 *  2. Numbers are kept whatever their length. "40%", "Unit-3", "14 sheds".
 *     A figure is the most specific thing a sentence can carry and the
 *     easiest to invent — filtering short tokens as noise would blind the
 *     check to exactly what it exists for.
 */

/* ── What a sentence lands as ─────────────────────────────────────────── */

export type Verdict = 'traced' | 'about_us' | 'neutral' | 'unsupported';

export interface Judgement {
  sentence: string;
  verdict: Verdict;
  /** URL from the brief that traced this claim, when it did. */
  source_url?: string;
}

export interface EvidenceLine {
  claim: string;
  url: string;
}

export interface TraceResult {
  sentences: Judgement[];
  /** URLs actually cited (deduped). Written to gt_journey_stories.evidence_refs. */
  evidence_refs: string[];
  traced: number;
  unsupported: number;
  ok: boolean;
  reason: string | null;
}

/* ── Splitting ────────────────────────────────────────────────────────── */

/** Break body text into sentence-ish units. Deliberately generous — a
 *  fragment on its own line counts, because greetings and sign-offs live
 *  on their own line and need to be recognised as "claims nothing". */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 4);
}

const OURS = /\b(we|we'd|we're|our|ours|us|i|i'd|i'm|my|happy|worth|minutes|call|chat|would you|shall|can i|let me)\b/i;

const STOP = new Set([
  'this', 'that', 'with', 'from', 'they', 'their', 'there', 'have', 'been',
  'which', 'about', 'into', 'over', 'across', 'were', 'than', 'then', 'what',
  'when', 'your', 'yours', 'after', 'before', 'while', 'because', 'would',
  'could', 'should', 'will', 'shall',
]);

/** Content words worth matching on. Numbers keep whatever their length. */
export function terms(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/)
    .filter((w) => w && (/\d/.test(w) || (w.length > 3 && !STOP.has(w))));
}

/** Does this line assert a specific fact at all? A greeting does not.
 *
 *  Three ways it can be a claim:
 *   1. It contains a number — the most specific and inventable thing a
 *      sentence can carry.
 *   2. It contains a proper noun (a capitalised word past the first
 *      position). "You have six plants across Gujarat" is a claim about
 *      Gujarat whether the rest of it is filler or not.
 *   3. It runs to enough content words to be more than a greeting.
 */
export function isClaim(s: string): boolean {
  if (/\d/.test(s)) return true;
  const words = s.split(/\s+/).filter(Boolean);
  // Proper noun past the first word — but only in a long enough sentence
  // to be a claim rather than an address. "Hi Menon," has the name but
  // says nothing; "You have six plants across Gujarat" is short enough on
  // content words to slip past the term-count check, and the proper noun
  // is exactly what makes it a claim.
  if (words.length >= 4 && words.slice(1).some((w) => /^[A-Z][a-z]/.test(w))) return true;
  return terms(s).length >= 5;
}

/* ── The trace ────────────────────────────────────────────────────────── */

/**
 * A sentence traces to a line of evidence if they share two content terms —
 * or one shared NUMBER, weighted double. A figure that appears in both is
 * not a coincidence; a figure that appears in neither is invented.
 *
 * The best-matching line wins ties, and it is the URL of THAT line that
 * ends up on evidence_refs — so a story that traces to five lines lists
 * five URLs, and the reviewer can click each one back to its source.
 */
export function traceSentence(sentence: string, evidence: EvidenceLine[]): EvidenceLine | null {
  const t = terms(sentence);
  const best = evidence.map((e) => {
    const et = terms(e.claim);
    const shared = t.filter((w) => et.includes(w));
    const num = shared.some((w) => /\d/.test(w));
    return { e, score: shared.length + (num ? 2 : 0) };
  }).filter((x) => x.score >= 2).sort((a, b) => b.score - a.score)[0];
  return best?.e ?? null;
}

/** Judge a story body against the brief's evidence lines.
 *
 *  The single question this answers: is there a sentence in here that makes
 *  a specific factual claim about them, is not about us, and matches no
 *  evidence? If so, R-S1 fails. Everything else — traced, about us,
 *  neutral — is fine, and approval may proceed.
 */
export function traceStory(subject: string | null, body: string, evidence: EvidenceLine[]): TraceResult {
  const lines: string[] = [];
  if (subject && subject.trim()) lines.push(subject.trim());
  lines.push(...sentences(body));

  const sentencesOut: Judgement[] = [];
  const evidenceRefs = new Set<string>();
  let traced = 0;
  let unsupported = 0;

  for (const s of lines) {
    const hit = traceSentence(s, evidence);
    if (hit) {
      sentencesOut.push({ sentence: s, verdict: 'traced', source_url: hit.url });
      evidenceRefs.add(hit.url);
      traced++;
    } else if (OURS.test(s)) {
      sentencesOut.push({ sentence: s, verdict: 'about_us' });
    } else if (!isClaim(s)) {
      sentencesOut.push({ sentence: s, verdict: 'neutral' });
    } else {
      sentencesOut.push({ sentence: s, verdict: 'unsupported' });
      unsupported++;
    }
  }

  // A story with no claim at all — no unsupported ones, but also nothing
  // about them — is a template with a name at the top. That is the exact
  // failure pilot_result's qualitative gate names, and it is a failure
  // whatever the reply rate turns out to be.
  const nothingAboutThem = traced === 0 && unsupported === 0
    && sentencesOut.some((x) => x.verdict === 'about_us');

  const ok = unsupported === 0 && !nothingAboutThem;
  const reason = unsupported > 0
    ? `${unsupported} sentence${unsupported === 1 ? '' : 's'} assert${unsupported === 1 ? 's' : ''} something the brief cannot support.`
    : nothingAboutThem
      ? 'Nothing here is about them. This is a template with a name on it — that is a failure even at a 10% reply rate.'
      : null;

  return {
    sentences: sentencesOut,
    evidence_refs: [...evidenceRefs],
    traced,
    unsupported,
    ok,
    reason,
  };
}

/* ── R-S2: does this story repeat a previous one? ─────────────────────── */

/** Very cheap similarity — Jaccard over content terms.
 *
 *  Two stories with almost the same content-word set are almost the same
 *  story, whatever the surface phrasing is. This is not a Turing test;
 *  it is a guardrail against copy-paste. Above the threshold the writer
 *  has to actually change the argument.
 */
export function similarity(a: string, b: string): number {
  const A = new Set(terms(a));
  const B = new Set(terms(b));
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
}

export const REPEAT_THRESHOLD = 0.5;

export function tooSimilar(newBody: string, earlier: string[]): { sim: number; against: number } | null {
  let worst = { sim: 0, against: -1 };
  earlier.forEach((old, i) => {
    const s = similarity(newBody, old);
    if (s > worst.sim) worst = { sim: s, against: i };
  });
  return worst.sim >= REPEAT_THRESHOLD ? worst : null;
}
