/**
 * Narrowing a list of role families while someone types.
 *
 * NOT the same job as `match_title` on the server. That one answers "which
 * family does this JOB TITLE belong to" and is deliberately strict: below its
 * floor it says nothing, because silently starting a Customer Success JD from
 * Backend Engineering would be worse than admitting it does not know.
 *
 * This is a SEARCH BOX over a dozen names the tenant already owns, and strict
 * is the wrong posture entirely. Charan, 2026-09-18: "search works only on full
 * keyword matching ... i type - buss -- it wont show anything". Typing four
 * letters of a family you can see on screen must narrow to it.
 *
 * So: prefix first, then one typo's worth of tolerance. "busi" and "buss" both
 * find Business Analysis; "bus" does too, on prefix alone. Nothing here picks a
 * family or fills anything in — it only decides what stays visible, which is
 * why loose matching is safe here and would not be there.
 */

/** Words too common to narrow anything. Matching them shows the whole list. */
const NOISE = new Set(['and', 'the', 'of', 'for', '&']);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !NOISE.has(t));
}

/** Two adjacent letters swapped — "desing", "tecnhical". One keystroke's slip
 *  and two Levenshtein edits, so it needs saying separately or the commonest
 *  typing mistake there is falls outside a one-edit tolerance. */
function isTransposition(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const diff: number[] = [];
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff.push(i);
  return diff.length === 2
    && diff[1] === diff[0] + 1
    && a[diff[0]] === b[diff[1]]
    && a[diff[1]] === b[diff[0]];
}

/**
 * Levenshtein, capped at 1 — the only distance this needs, and the cap lets it
 * bail on the first row instead of filling a matrix.
 */
function withinOneEdit(a: string, b: string): boolean {
  if (isTransposition(a, b)) return true;
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  let i = 0; let j = 0; let slack = 1;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i++; j++; continue; }
    if (slack === 0) return false;
    slack--;
    if (short.length === long.length) { i++; j++; } else { j++; }
  }
  return true;
}

/** Does `candidate` (one word) answer to the fragment someone is typing? */
export function wordMatches(fragment: string, candidate: string): boolean {
  if (!fragment) return true;
  if (candidate.startsWith(fragment)) return true;
  // A typo is only worth tolerating once there is enough typed to be sure what
  // was meant. At three letters "buss" against "bus" is not a typo, it is a
  // different word, and tolerating it makes the list flicker rather than
  // narrow.
  if (fragment.length < 4) return false;
  // Both lengths, because a DELETION typo ("suport") is one character shorter
  // than the prefix it meant ("suppor") — comparing only against the
  // same-length slice catches substitutions and silently misses the most
  // common typo of all.
  return withinOneEdit(fragment, candidate.slice(0, fragment.length))
    || withinOneEdit(fragment, candidate.slice(0, fragment.length + 1));
}

export interface Searchable { name: string; suggested_titles?: string[] }

/**
 * Filter a family list by what has been typed so far.
 *
 * Every typed word must find a home somewhere in the family — its name or one
 * of the titles it covers — so "business ana" narrows further than "business"
 * rather than matching more.
 */
export function searchFamilies<T extends Searchable>(list: T[], query: string): T[] {
  const typed = tokens(query);
  if (!typed.length) return list;
  // "back end" and "backend" are the same word to everyone except a tokeniser,
  // and people write their own titles both ways. So a query that finds nothing
  // as separate words is retried glued together — the same normalisation
  // title-match.ts applies on the server, for the same reason.
  const glued = typed.join('');
  return list.filter((f) => {
    const hay = tokens([f.name, ...(f.suggested_titles ?? [])].join(' '));
    if (typed.every((t) => hay.some((h) => wordMatches(t, h)))) return true;
    return typed.length > 1 && hay.some((h) => wordMatches(glued, h));
  });
}
