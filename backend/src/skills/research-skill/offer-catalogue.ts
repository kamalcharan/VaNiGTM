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

import { createHash } from 'crypto';
import type { SkillDb } from '../../types/skill.types';

/**
 * How big an ask an offer is (migration 212).
 *
 * The second axis, orthogonal to fit. A retainer and a one-day workshop can
 * fit a company equally well; only one of them is a sane thing to put in
 * front of a stranger. Ordered — the index IS the rung.
 */
export const COMMITMENTS = ['entry', 'project', 'retainer'] as const;
export type Commitment = (typeof COMMITMENTS)[number];

export const COMMITMENT_LABEL: Record<Commitment, string> = {
  entry: 'Entry — a stranger can say yes to it',
  project: 'Project — bounded delivery',
  retainer: 'Retainer — ongoing, rarely a first ask',
};

export const isCommitment = (v: unknown): v is Commitment =>
  typeof v === 'string' && (COMMITMENTS as readonly string[]).includes(v);

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
  /**
   * Never shown to the fit-scoring model. Applied afterwards, in code, to
   * choose the smallest sane first ask among offers that fit equally well.
   */
  commitment: Commitment;
  /** 'agent' = drafted from the site/documents, awaiting review. 'human' =
   *  typed or reviewed directly. Migration 239. */
  source: 'agent' | 'human';
  /** NULL = agent draft not yet reviewed — earns no profile_score credit
   *  and is not fit-scored (offerIsReady does not gate on this; readiness
   *  and confirmation are separate axes). */
  confirmed_at: string | null;
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

    if (!isCommitment(offer.commitment)) {
      problems.push(
        `${where}: commitment must be one of ${COMMITMENTS.join(', ')} `
        + `(got "${String(offer.commitment)}")`,
      );
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
  commitment: string | null;
  source: string; confirmed_at: Date | string | null;
  updated_at: Date | string;
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
  // The column is NOT NULL with a default, so this only matters for rows
  // hand-built in tests. Not silently coerced elsewhere — an unrecognised
  // value is reported by catalogueProblems rather than quietly treated as
  // one of the three.
  commitment: isCommitment(r.commitment) ? r.commitment : (r.commitment as Commitment),
  source: r.source === 'agent' ? 'agent' : 'human',
  confirmed_at: r.confirmed_at ? new Date(r.confirmed_at).toISOString() : null,
});

/** Every active offer for a tenant, validated or not — confirmed and
 *  unconfirmed drafts alike. Confirmation gates profile_score credit
 *  (profile.service.ts), not fit-scoring inclusion — those are deliberately
 *  separate axes; wiring confirmation into what research-skill scores
 *  against is out of scope here (Intelligent Add Offers, 2026-08-15). */
export async function readOffers(db: SkillDb, tenantId: string): Promise<Offer[]> {
  const res = await db.query<OfferRow>(
    `SELECT offer_key, name, one_line, who_for, problem, what_we_do,
            signals, disqualifiers, price_band, proof, commitment,
            source, confirmed_at, updated_at
       FROM gt_offers
      WHERE tenant_id = $tenant_id AND is_active = true
      ORDER BY sort_order, offer_key`,
    { tenant_id: tenantId },
  );
  return res.rows.map(toOffer);
}

/**
 * Which offer set a judgement was made against.
 *
 * Key + updated_at per active offer, hashed. Edit one word of one offer and
 * this changes, so every brief judged against the old set is stale and gets
 * re-scored — WITHOUT being re-crawled (migration 211). Nothing has to
 * remember to invalidate anything.
 *
 * Deliberately NOT a hash of the offer CONTENT: updated_at moves whenever
 * the row is saved, which is the honest trigger. Hashing content would make
 * a save that changed nothing look like a change, and hashing less would
 * miss edits.
 */
export async function catalogueFingerprint(
  db: SkillDb,
  tenantId: string,
): Promise<string> {
  const res = await db.query<{ offer_key: string; updated_at: Date | string }>(
    `SELECT offer_key, updated_at FROM gt_offers
      WHERE tenant_id = $tenant_id AND is_active = true
      ORDER BY offer_key`,
    { tenant_id: tenantId },
  );
  const material = res.rows
    .map((r) => `${r.offer_key}@${new Date(r.updated_at).toISOString()}`)
    .join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 64);
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
 * The offers in an order that is stable for one company and different across
 * companies.
 *
 * ── WHY ORDER HAD TO STOP BEING FIXED ─────────────────────────────────
 *
 * readOffers returns `ORDER BY sort_order`, so the same offer was rendered
 * first in every prompt for every company in the batch. On the first pilot
 * run that offer won on 4 of 5 companies, by margins of 0.03-0.04 — inside
 * the noise of the model's own judgement. Position was doing work that
 * evidence should have been doing.
 *
 * Deterministic rather than random: the same company re-scored against the
 * same offers gets the same ordering, so a changed score means the offer
 * wording changed, not that the dice landed differently. A run is
 * reproducible or it is not evidence.
 */
export function shuffleForCompany<T extends { id: string }>(
  offers: T[],
  seed: string,
): T[] {
  return offers
    .map((o) => ({
      o,
      k: createHash('sha256').update(`${seed}:${o.id}`).digest('hex'),
    }))
    .sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0))
    .map((x) => x.o);
}

/**
 * The catalogue as the fit-scoring prompt sees it. Disqualifiers are included
 * deliberately: "no fit" is a first-class outcome, and a model given only
 * reasons to say yes will always find one.
 *
 * `commitment` is deliberately ABSENT. The model's job is to say how well
 * each offer matches this company and nothing else; how big an ask each one
 * is gets applied afterwards, in code, where it can be inspected and argued
 * with. Told both at once, the model conflates them and we lose the ability
 * to see which judgement was which.
 *
 * Pass `seed` (the prospect id) to vary the order per company — see
 * shuffleForCompany for why that matters.
 */
export function catalogueForPrompt(cat: OfferCatalogue, seed?: string): string {
  const offers = seed ? shuffleForCompany(cat.offers, seed) : cat.offers;
  return offers.map((o) => [
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

/* ── The ladder rule ─────────────────────────────────────────────────── */

/**
 * Two scores this close are the same score.
 *
 * Chosen from the pilot data, not from theory: the observed gaps between the
 * top offers were 0.03-0.07, and the gap to an offer that genuinely did not
 * fit was 0.4+. 0.15 sits in the empty space between those two populations.
 */
export const FIT_MARGIN = 0.15;

const RUNG: Record<Commitment, number> = { entry: 0, project: 1, retainer: 2 };

export interface OfferChoice {
  /** Highest-scoring offer, as the model judged it. */
  best: string | null;
  /** What to actually open with — the smallest ask that still fits. */
  recommended: string | null;
  /** Top score minus second score. NULL when fewer than two were scored. */
  margin: number | null;
  /** True when the top two are inside FIT_MARGIN — i.e. not distinguishable. */
  unclear: boolean;
  /** Set when the rule moved the recommendation off the top scorer. */
  laddered_from: string | null;
}

/**
 * Which offer to lead with, given every offer's fit score.
 *
 * Fit answers "which offer best matches what this company IS". It does not
 * answer "which offer is the right size to put in front of a company that
 * has never heard of us" — and the first pilot run showed those coming apart:
 * a retainer beating a one-day workshop by 0.03 on a cold company is not a
 * reason to open with the retainer.
 *
 * So: among the offers within FIT_MARGIN of the top score, take the lowest
 * commitment rung; break ties on the higher score, then on offer id so the
 * result is reproducible.
 *
 * Only ever called when the model itself said something fits. A "no fit"
 * verdict stays a no — the rule picks a smaller ask, it never manufactures
 * one (CLAUDE.md rule 12).
 */
export function chooseOffer(
  scores: { offer_id: string; score: number }[],
  offers: Pick<Offer, 'id' | 'commitment'>[],
): OfferChoice {
  const rung = new Map(offers.map((o) => [o.id, RUNG[o.commitment] ?? RUNG.project]));
  const ranked = scores
    .filter((s) => rung.has(s.offer_id))
    .sort((a, b) => b.score - a.score || (a.offer_id < b.offer_id ? -1 : 1));

  if (ranked.length === 0) {
    return { best: null, recommended: null, margin: null, unclear: false, laddered_from: null };
  }

  const best = ranked[0];
  const margin = ranked.length > 1
    ? Number((best.score - ranked[1].score).toFixed(3))
    : null;

  // Epsilon because 0.9 - 0.75 is 0.15000000000000002 in binary floating
  // point, and an offer landing exactly on the margin must be inside it.
  const within = ranked.filter((s) => best.score - s.score <= FIT_MARGIN + 1e-9);
  const pick = within.reduce((a, b) => {
    const ra = rung.get(a.offer_id)!;
    const rb = rung.get(b.offer_id)!;
    if (ra !== rb) return ra < rb ? a : b;
    return b.score > a.score ? b : a;
  });

  return {
    best: best.offer_id,
    recommended: pick.offer_id,
    margin,
    unclear: margin !== null && margin < FIT_MARGIN,
    laddered_from: pick.offer_id === best.offer_id ? null : best.offer_id,
  };
}
