/**
 * Match a job title to a role family's starter shape.
 *
 * THE POINT OF ENRICHMENT, delivered where people actually are.
 *
 * Charan, 2026-09-16: a one-time adoption step gives velocity but after that
 * "most probably they will have to use prompt or manual creation ... i say 30%
 * chance to view enrichment data". So a browse-the-pack screen serves the 30%.
 * The other 70% type a title and start talking. Enrichment has to pay off in
 * THAT path or it does not pay off at all.
 *
 * Every pack already carries `suggested_titles`, and migration 245's composer
 * prompt already declares `{{starter_shape_json}}` as an input it expects to be
 * handed. Both halves were designed for this and never connected. This is the
 * connection: title in, starter shape out.
 *
 * It inverts the doorway's question. Family tiles ask a hiring manager to
 * categorise a role before they have said what it is — which is backwards, and
 * is why a Customer Success hire ended up in an engineering family. Here they
 * say the role and the family is inferred, or honestly not inferred.
 *
 * DETERMINISTIC ON PURPOSE. No model call: this runs while someone is typing,
 * must answer in milliseconds, and must give the same answer twice. It is also
 * the reason enrichment can be researched offline and still feel instant.
 *
 * A NON-MATCH IS A RESULT, NOT A FAILURE. Below the floor it returns
 * matched:false rather than the nearest family. Silently starting a Customer
 * Success JD from Backend Engineering because it was "closest" is precisely the
 * fabrication rule 9d forbids — and precisely what happened before.
 */

/** Seniority and shape words that carry no signal about WHICH family a role is. */
const NOISE = new Set([
  'senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'head', 'chief',
  'associate', 'assistant', 'deputy', 'vp', 'director', 'manager2',
  'i', 'ii', 'iii', 'iv', '1', '2', '3',
  'the', 'a', 'an', 'of', 'for', 'and', 'or', 'at', 'in', 'to', 'with',
  'intern', 'trainee', 'contract', 'contractor', 'freelance',
  'fulltime', 'parttime', 'remote', 'hybrid', 'onsite',
]);

/**
 * "Senior Back-end Developer (Remote)" → ["backend", "developer"].
 *
 * Hyphens are stripped rather than split, so "back-end" and "backend" are one
 * token. Without that, the single most common way engineers write their own
 * titles fails to match the single most common way packs write them.
 */
export function normaliseTitle(raw: string): string[] {
  return raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\([^)]*\)/g, ' ')        // drop "(Remote)", "(Contract)"
    .replace(/[-_/]/g, '')             // back-end → backend, front/end → frontend
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !NOISE.has(t));
}

export interface TitleMatch {
  /** Pack row this came from. */
  pack_code: string;
  pack_version: number;
  family_name: string;
  /** The pack title that matched, so the UI can say WHY it matched. */
  matched_title: string;
  /** 0-100. See SCORE_FLOOR for what counts as a match at all. */
  score: number;
  /** True when the pack carries provenance — i.e. researched, not a 244 seed. */
  researched: boolean;
  starter: Record<string, unknown>;
}

export interface PackCandidate {
  pack_code: string;
  pack_version: number;
  family_name: string;
  suggested_titles: string[];
  researched: boolean;
  starter: Record<string, unknown>;
}

/**
 * Below this, say nothing. Tuned so "Senior Backend Engineer" matches
 * "Backend Engineer" (one shared token of two = 50 via overlap, lifted by the
 * containment rule) while "Customer Success Manager" matches no engineering
 * family at all. Raise it if tenants report wrong shapes; lower it only with a
 * test that shows what new nonsense it admits.
 */
export const SCORE_FLOOR = 45;

/**
 * Score one typed title against one pack title, 0-100.
 *
 *   exact tokens          100
 *   one contains the other 80 — "backend engineer" vs "backend engineer india"
 *   token overlap          up to 70, proportional
 *
 * Deliberately not a string-edit distance: "Data Engineer" and "Date Engineer"
 * are one character apart and mean different jobs, while "Backend Developer"
 * and "Back-end Engineer" share no exact word after normalisation but are the
 * same role. Tokens carry the meaning; characters do not.
 */
/**
 * Two tokens mean the same role word.
 *
 * Exact, or one is a prefix of the other and the shorter is at least five
 * characters: engineer/engineering, design/designer, develop/developer. Those
 * are the -ing and -er pairs that separate how a family is named ("Data
 * Engineering") from how a job is titled ("Data Engineer"), and without this
 * they score as completely unrelated words.
 *
 * Five characters, not three, because short prefixes are where this turns into
 * nonsense — "dev"/"devops", "data"/"database". It is a deliberately partial
 * rule: manager/management still do not match each other (neither is a prefix
 * of the other), which is a known limit, not an oversight. Add pairs when a
 * real miss shows up, with the test that proves it.
 */
/**
 * Role words that are the same job under different house styles.
 *
 * Measured, not assumed. Run against migration 244's titles plus the first
 * real research output, "Frontend Developer" matched NOTHING while a Frontend
 * Engineering family sat right there, and "Full Stack Engineer" missed a
 * "Full Stack Developer" title by one word. Both are titles a hiring manager
 * types constantly.
 *
 * Kept deliberately tiny. Every entry is a claim that two words mean the same
 * ROLE, and a wrong one silently hands somebody the wrong playbook — which is
 * the failure this whole matcher exists to prevent. Add one only with the
 * miss that motivated it.
 */
const SYNONYMS: string[][] = [
  ['engineer', 'developer', 'dev', 'programmer'],
];

const SYNONYM_OF = new Map<string, number>();
SYNONYMS.forEach((group, i) => group.forEach((w) => SYNONYM_OF.set(w, i)));

function sameWord(x: string, y: string): boolean {
  if (x === y) return true;

  const gx = SYNONYM_OF.get(x);
  if (gx !== undefined && gx === SYNONYM_OF.get(y)) return true;

  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 5 && long.startsWith(short);
}

export function scoreTitle(typed: string[], candidate: string[]): number {
  if (!typed.length || !candidate.length) return 0;

  if (typed.join(' ') === candidate.join(' ')) return 100;

  const setA = [...new Set(typed)];
  const setB = [...new Set(candidate)];
  const shared = setA.filter((t) => setB.some((c) => sameWord(t, c)));
  if (!shared.length) return 0;

  // Containment: every token of the shorter title appears in the longer one.
  const smallerSize = Math.min(setA.length, setB.length);
  if (shared.length === smallerSize) return 80;

  // Otherwise proportional overlap. Shared tokens are counted once in the
  // union, so a near-miss does not get punished twice for the same word.
  const union = setA.length + setB.length - shared.length;
  return Math.round((shared.length / union) * 70);
}

/**
 * Best family for a typed title, or null.
 *
 * Ties break toward the RESEARCHED pack. A tenant's industry may carry both a
 * 244 seed and a researched pack whose titles overlap; the researched one was
 * produced for this industry rather than handwritten before any tenant existed,
 * so it wins on equal evidence. This is also what lets seeds keep serving every
 * industry nobody has researched yet, without competing once one has been.
 */
export function matchTitle(
  title: string,
  candidates: PackCandidate[],
): { matched: TitleMatch | null; alternates: TitleMatch[] } {
  const typed = normaliseTitle(title);
  if (!typed.length) return { matched: null, alternates: [] };

  const scored: TitleMatch[] = [];
  for (const c of candidates) {
    let best = 0;
    let bestTitle = '';
    for (const st of c.suggested_titles ?? []) {
      const s = scoreTitle(typed, normaliseTitle(st));
      if (s > best) { best = s; bestTitle = st; }
    }
    // The family NAME is a candidate too — "Data Engineering" should match
    // someone who typed "Data Engineer" even if the titles list missed it.
    const nameScore = scoreTitle(typed, normaliseTitle(c.family_name));
    if (nameScore > best) { best = nameScore; bestTitle = c.family_name; }

    if (best > 0) {
      scored.push({
        pack_code: c.pack_code,
        pack_version: c.pack_version,
        family_name: c.family_name,
        matched_title: bestTitle,
        score: best,
        researched: c.researched,
        starter: c.starter,
      });
    }
  }

  scored.sort((x, y) =>
    y.score - x.score
    || Number(y.researched) - Number(x.researched)
    || x.family_name.localeCompare(y.family_name));   // stable, so tests are not flaky

  const passing = scored.filter((s) => s.score >= SCORE_FLOOR);
  return {
    matched: passing[0] ?? null,
    // Alternates only when there is a match to be an alternate TO. Offering
    // "did you mean" for a role we do not recognise is guessing with extra
    // steps.
    alternates: passing.slice(1, 4),
  };
}
