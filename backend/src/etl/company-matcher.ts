/**
 * company-matcher — person → company by NAME, in code, before any model.
 *
 * A people export carries a company as a display string ("Rashtriya Chemicals
 * & Fertilizers Ltd.", "RCF Ltd", "N") and no domain. The pool carries
 * `name_key` (migration 195: upper, legal suffixes dropped). Matching is:
 *
 *   1. key equality after the same normalisation as name_key, plus a few
 *      more suffixes the pool's SQL does not strip (CORP, INDUSTRIES is
 *      kept — it distinguishes companies).
 *   2. token similarity (Dice over word tokens) and an acronym test, so
 *      "RCF" meets "RASHTRIYA CHEMICALS FERTILIZERS".
 *   3. the headline's "at X" as a second candidate string for the person.
 *
 * Scores: ≥ AUTO is a match; between GAP and AUTO is the GAP — ambiguous,
 * held for Haiku (or a person) with the candidates attached; below GAP is
 * no match. Haiku works ONLY on the gap (Charan, 2026-09-26): "we can have
 * fuzzy logic working internally … haiku should work only on the gap".
 */

export const AUTO = 0.85;
export const GAP = 0.55;

const LEGAL = /\b(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE|CORP|CORPORATION|CORPN|M\/S|MS|P|L|GROUP|INDIA)\b/g;

/** Same idea as the pool's name_key, applied in JS so both sides agree. */
export function companyKey(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/^\s*M\/S\.?\s*/, '')          // "M/s.CHETTINAD" — the Indian "Messrs"
    .replace(/\b([A-Z])\.(?=[A-Z]\b|[A-Z]\.)/g, '$1')   // "R.C.F. Ltd" → "RCF. Ltd", "H.O.C.LTD" → "HOC.LTD"
    .replace(/\b([A-Z]{2,})\.(?=[A-Z])/g, '$1 ')            // "HOC.LTD" → "HOC LTD"
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(LEGAL, ' ')
    .replace(/\bAND\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens of a key; single letters are dropped (initials, "P", "L"). */
export function tokens(key: string): string[] {
  return key.split(' ').filter((t) => t.length > 1);
}

export function acronym(key: string): string {
  return tokens(key).map((t) => t[0]).join('');
}

/** The key with "AND" kept, for acronyms that include it: FACT, not FCT. */
export function acronymWithAnd(raw: unknown): string {
  const k = String(raw ?? '').toUpperCase().replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
  return k.split(' ').filter((t) => t.length > 1).map((t) => t[0]).join('');
}

/** Dice coefficient over token sets, 0..1. */
export function tokenDice(a: string, b: string): number {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * "Chief Engineer at RCF Ltd" → "RCF Ltd". Also "@ X", "with X", "in X".
 * Stops at the first separator a headline uses (|, ·, comma, dash, period).
 */
export function employerFromHeadline(headline: unknown): string | null {
  const h = String(headline ?? '');
  // stops at | · , ; ! a spaced dash or an opening bracket — NOT at ". ", so
  // "R.C.F. Ltd" survives; a trailing sentence period is stripped below
  const tail = /\s+([A-Za-z0-9&.'\- ]{2,80}?)(?=\s*(?:[|·,;!(]|\s-\s|$))/.source;
  let m: RegExpMatchArray | null = null;
  for (const re of [new RegExp('(?:\\bat|@)' + tail, 'gi'), new RegExp('\\bwith' + tail, 'gi')]) {
    let last: RegExpMatchArray | null = null;
    for (const x of h.matchAll(re)) last = x;          // the LAST "at" is the current employer
    if (last) { m = last; break; }
  }
  if (!m) return null;
  const s = m[1].trim().replace(/\.$/, '');
  if (s.length < 2 || /^(the company|engineering|present|home)$/i.test(s)) return null;
  return s;
}

export interface Candidate { id: number | string; name: string; key?: string }
export interface MatchResult {
  status: 'matched' | 'gap' | 'none';
  candidate: Candidate | null;
  score: number;
  method: 'key' | 'acronym' | 'tokens' | 'headline' | 'none';
  /** the strings that were tried, for the audit row */
  tried: string[];
  /** the runners-up, attached to a gap so the model sees only these */
  shortlist: Array<{ candidate: Candidate; score: number }>;
}

function scoreOne(q: string, c: Candidate): { score: number; method: MatchResult['method'] } {
  const ck = c.key ?? companyKey(c.name);
  if (!q || !ck) return { score: 0, method: 'none' };
  if (q === ck) return { score: 1, method: 'key' };
  if (q.replace(/ /g, '') === ck.replace(/ /g, '')) return { score: 0.95, method: 'key' };   // "MICROLABS" / "MICRO LABS"
  // acronym either way: "RCF" vs "RASHTRIYA CHEMICALS FERTILIZERS"; "GSFC VADODARA" leads with the acronym
  const qt = tokens(q), ct = tokens(ck);
  const cas = new Set([acronym(ck), acronymWithAnd(c.name)]);
  const qas = new Set([acronym(q), acronymWithAnd(q)]);
  if (qt.length <= 2 && qt[0]?.length >= 3 && cas.has(qt[0])) return { score: qt.length === 1 ? 0.9 : 0.88, method: 'acronym' };
  if (ct.length <= 2 && ct[0]?.length >= 3 && qas.has(ct[0])) return { score: 0.9, method: 'acronym' };
  const d = tokenDice(q, ck);
  // one side a strict prefix of the other ("SANGAM INDIA LTD, BHILWARA" vs "SANGAM INDIA")
  const prefix = q.startsWith(ck + ' ') || ck.startsWith(q + ' ');
  return { score: prefix ? Math.max(d, 0.86) : d, method: 'tokens' };
}

/**
 * Match one person's company strings against a candidate list (the pool, or
 * the pool pre-filtered by blocking). Tries the column first, then the
 * headline's employer; the best score wins.
 */
export function matchCompany(
  companyColumn: unknown,
  headline: unknown,
  candidates: Candidate[],
): MatchResult {
  const tried: string[] = [];
  const queries: Array<{ q: string; via: 'column' | 'headline' }> = [];
  const col = companyKey(companyColumn);
  if (col) { queries.push({ q: col, via: 'column' }); tried.push(String(companyColumn)); }
  const emp = employerFromHeadline(headline);
  if (emp) { const k = companyKey(emp); if (k && k !== col) { queries.push({ q: k, via: 'headline' }); tried.push(emp); } }

  const scored: Array<{ candidate: Candidate; score: number; method: MatchResult['method'] }> = [];
  for (const c of candidates) {
    let best = { score: 0, method: 'none' as MatchResult['method'] };
    for (const { q, via } of queries) {
      const s = scoreOne(q, c);
      if (s.score > best.score) best = { score: s.score, method: via === 'headline' && s.method !== 'none' ? 'headline' : s.method };
    }
    if (best.score > 0) scored.push({ candidate: c, ...best });
  }
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];
  const shortlist = scored.slice(0, 3).map(({ candidate, score }) => ({ candidate, score }));
  if (!top || top.score < GAP) return { status: 'none', candidate: null, score: top?.score ?? 0, method: 'none', tried, shortlist };
  // a clear winner: top ≥ AUTO and the runner-up is not within 0.05 of it
  const runner = scored[1]?.score ?? 0;
  if (top.score >= AUTO && top.score - runner >= 0.05) {
    return { status: 'matched', candidate: top.candidate, score: top.score, method: top.method, tried, shortlist };
  }
  return { status: 'gap', candidate: null, score: top.score, method: top.method, tried, shortlist };
}
