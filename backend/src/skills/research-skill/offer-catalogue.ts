/**
 * VaNi GTM — Offer catalogue
 *
 * What a tenant sells, in the shape the fit-scoring stage needs. Loaded from
 * `backend/config/offers/<slug>.json`.
 *
 * ── WHY A FILE, FOR NOW ───────────────────────────────────────────────
 *
 * This is tenant business data and it will end up in a table with a UI —
 * every offer will be editable, versioned and approved like anything else
 * externally visible. But while the wording is being iterated by hand, a
 * versioned file is reviewable in a diff, and a diff is exactly what you
 * want when the question is "did changing this sentence change who we
 * contact". The loader is the only thing that would change.
 *
 * ── VALIDATION FAILS LOUDLY ───────────────────────────────────────────
 *
 * Fit scoring is only as good as what it scores against. A one-line offer
 * produces a number that LOOKS meaningful and is not, and that number would
 * then decide who gets contacted. So a catalogue missing `proof`,
 * `price_band`, `signals` or `disqualifiers` throws at load, before a single
 * account is crawled — rather than quietly scoring against a blank
 * (CLAUDE.md rule 12).
 */

import fs from 'fs';
import path from 'path';

export interface Offer {
  id: string;
  name: string;
  one_line: string;
  who_for: string;
  problem: string;
  what_we_do: string[];
  /** What in a crawled site indicates this offer fits. Drives fit scoring. */
  signals: string[];
  /** When NOT to pitch this — as load-bearing as the signals. */
  disqualifiers: string[];
  price_band: string;
  proof: string;
}

export interface OfferCatalogue {
  tenant_slug: string;
  tenant_label: string;
  segment: string;
  offers: Offer[];
}

const CONFIG_DIR = path.resolve(__dirname, '../../../config/offers');

const REQUIRED_TEXT: (keyof Offer)[] = [
  'id', 'name', 'one_line', 'who_for', 'problem', 'price_band', 'proof',
];
const REQUIRED_LIST: (keyof Offer)[] = ['what_we_do', 'signals', 'disqualifiers'];

/** Long enough to carry a thought. A three-word `proof` is not proof. */
const MIN_TEXT = 12;

export function cataloguePath(slug: string): string {
  return path.join(CONFIG_DIR, `${slug}.json`);
}

export function validateCatalogue(cat: OfferCatalogue, source: string): void {
  const problems: string[] = [];

  if (!cat.tenant_slug) problems.push('tenant_slug is missing');
  if (!Array.isArray(cat.offers) || cat.offers.length === 0) {
    throw new Error(`[Offers] ${source}: no offers defined.`);
  }

  const seen = new Set<string>();
  for (const [i, offer] of cat.offers.entries()) {
    const where = offer.id || `offer[${i}]`;

    for (const field of REQUIRED_TEXT) {
      const value = offer[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        problems.push(`${where}.${field} is empty`);
      } else if (field !== 'id' && value.trim().length < MIN_TEXT) {
        problems.push(`${where}.${field} is too short to score against ("${value.trim()}")`);
      }
    }

    for (const field of REQUIRED_LIST) {
      const value = offer[field];
      if (!Array.isArray(value) || value.length === 0) {
        problems.push(`${where}.${field} is empty — fit scoring has nothing to match on`);
      } else if (value.some((v) => typeof v !== 'string' || v.trim().length < MIN_TEXT)) {
        problems.push(`${where}.${field} contains an entry too short to be useful`);
      }
    }

    if (offer.id) {
      if (seen.has(offer.id)) problems.push(`duplicate offer id "${offer.id}"`);
      seen.add(offer.id);
    }
  }

  if (problems.length > 0) {
    throw new Error(
      `[Offers] ${source} is not ready for fit scoring:\n  - ${problems.join('\n  - ')}\n` +
      '\nFill these in before running the research batch. Scoring against a blank ' +
      'produces a number that looks meaningful and is not, and that number decides ' +
      'who gets contacted.',
    );
  }
}

export function loadOfferCatalogue(slug: string): OfferCatalogue {
  const file = cataloguePath(slug);

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error(
      `[Offers] No catalogue for "${slug}" at ${file}. ` +
      'Create it from another tenant\'s file — fit scoring cannot run without one.',
    );
  }

  let parsed: OfferCatalogue;
  try {
    parsed = JSON.parse(raw) as OfferCatalogue;
  } catch (err) {
    throw new Error(`[Offers] ${file} is not valid JSON: ${(err as Error).message}`);
  }

  validateCatalogue(parsed, file);
  return parsed;
}

/**
 * The catalogue as the fit-scoring prompt sees it. Disqualifiers are included
 * deliberately: "no fit" is a first-class outcome, and a model given only
 * reasons to say yes will always find one.
 */
export function catalogueForPrompt(cat: OfferCatalogue): string {
  return cat.offers.map((o) => [
    `## ${o.name}  (id: ${o.id})`,
    o.one_line,
    ``,
    `Who it is for: ${o.who_for}`,
    `Problem it solves: ${o.problem}`,
    `What we do:`,
    ...o.what_we_do.map((w) => `  - ${w}`),
    `Indicators this fits:`,
    ...o.signals.map((s) => `  - ${s}`),
    `Do NOT recommend this when:`,
    ...o.disqualifiers.map((d) => `  - ${d}`),
    `Price band: ${o.price_band}`,
    `Proof: ${o.proof}`,
  ].join('\n')).join('\n\n');
}
