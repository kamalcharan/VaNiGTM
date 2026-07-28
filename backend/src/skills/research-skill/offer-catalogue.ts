/**
 * VaNi GTM — Offer catalogue
 *
 * What a tenant sells, in the shape the fit-scoring stage needs. Read from
 * `gt_offers` (migration 209) and edited on the Research screen.
 *
 * This was a JSON file under config/offers/ for exactly as long as the
 * wording was being drafted by a developer. The moment a human had to fill
 * it in, a file on the server stopped being a reasonable answer.
 *
 * ── VALIDATION FAILS LOUDLY ───────────────────────────────────────────
 *
 * Fit scoring is only as good as what it scores against. A one-line offer
 * produces a number that LOOKS meaningful and is not, and that number then
 * decides who gets contacted. So a catalogue missing `proof`, `price_band`,
 * `signals` or `disqualifiers` throws BEFORE a single account is crawled,
 * naming every gap at once, rather than quietly scoring against a blank
 * (CLAUDE.md rule 12).
 */

import type { SkillDb } from '../../types/skill.types';

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
  tenant_id: string;
  offers: Offer[];
}

/** Fields a human must supply before anything can be scored against them. */
const REQUIRED_TEXT: (keyof Offer)[] = [
  'id', 'name', 'one_line', 'who_for', 'problem', 'price_band', 'proof',
];
const REQUIRED_LIST: (keyof Offer)[] = ['what_we_do', 'signals', 'disqualifiers'];

/** Long enough to carry a thought. A three-word `proof` is not proof. */
export const MIN_TEXT = 12;

/**
 * Everything wrong with a catalogue, in one list. Returning all the problems
 * rather than throwing on the first is what lets the screen show a checklist
 * instead of a whack-a-mole.
 */
export function catalogueProblems(offers: Offer[]): string[] {
  const problems: string[] = [];
  if (offers.length === 0) return ['No offers defined.'];

  const seen = new Set<string>();
  for (const [i, offer] of offers.entries()) {
    const where = offer.name || offer.id || `offer ${i + 1}`;

    for (const field of REQUIRED_TEXT) {
      const value = offer[field];
      if (typeof value !== 'string' || value.trim().length === 0) {
        problems.push(`${where}: ${field} is empty`);
      } else if (field !== 'id' && value.trim().length < MIN_TEXT) {
        problems.push(`${where}: ${field} is too short to score against ("${value.trim()}")`);
      }
    }

    for (const field of REQUIRED_LIST) {
      const value = offer[field];
      if (!Array.isArray(value) || value.length === 0) {
        problems.push(`${where}: ${field} is empty — fit scoring has nothing to match on`);
      } else if (value.some((v) => typeof v !== 'string' || v.trim().length < MIN_TEXT)) {
        problems.push(`${where}: ${field} contains an entry too short to be useful`);
      }
    }

    if (offer.id) {
      if (seen.has(offer.id)) problems.push(`duplicate offer id "${offer.id}"`);
      seen.add(offer.id);
    }
  }
  return problems;
}

/** True when this one offer could be scored against as it stands. */
export function offerIsReady(offer: Offer): boolean {
  return catalogueProblems([offer]).length === 0;
}

export function assertReady(offers: Offer[]): void {
  const problems = catalogueProblems(offers);
  if (problems.length > 0) {
    throw new Error(
      `OFFER_CATALOGUE_INCOMPLETE: the offers are not ready for fit scoring:\n  - ${problems.join('\n  - ')}\n`
      + '\nFill these in on the Research screen before running the batch. Scoring '
      + 'against a blank produces a number that looks meaningful and is not, and '
      + 'that number decides who gets contacted.',
    );
  }
}

interface OfferRow {
  offer_key: string; name: string; one_line: string; who_for: string;
  problem: string; what_we_do: string[]; signals: string[];
  disqualifiers: string[]; price_band: string | null; proof: string | null;
}

const toOffer = (r: OfferRow): Offer => ({
  id: r.offer_key,
  name: r.name,
  one_line: r.one_line,
  who_for: r.who_for,
  problem: r.problem,
  what_we_do: r.what_we_do ?? [],
  signals: r.signals ?? [],
  disqualifiers: r.disqualifiers ?? [],
  price_band: r.price_band ?? '',
  proof: r.proof ?? '',
});

/** Every active offer for a tenant, validated or not. */
export async function readOffers(db: SkillDb, tenantId: string): Promise<Offer[]> {
  const res = await db.query<OfferRow>(
    `SELECT offer_key, name, one_line, who_for, problem, what_we_do,
            signals, disqualifiers, price_band, proof
       FROM gt_offers
      WHERE tenant_id = $tenant_id AND is_active = true
      ORDER BY sort_order, offer_key`,
    { tenant_id: tenantId },
  );
  return res.rows.map(toOffer);
}

/**
 * The catalogue, or a loud refusal. Used by the research agent — nothing is
 * crawled until this returns.
 */
export async function loadOfferCatalogue(
  db: SkillDb,
  tenantId: string,
): Promise<OfferCatalogue> {
  const offers = await readOffers(db, tenantId);
  if (offers.length === 0) {
    throw new Error(
      'OFFER_CATALOGUE_EMPTY: this tenant has no offers. Add what you sell on the '
      + 'Research screen — fit scoring cannot run without it.',
    );
  }
  assertReady(offers);
  return { tenant_id: tenantId, offers };
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
