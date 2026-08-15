/**
 * Offer readiness.
 *
 * The point of these tests is the FAILURE cases. This validation is the only
 * thing between a half-written offer and a confident fit score that decides
 * who gets contacted — and it now drives a checklist on screen, so it has to
 * report EVERY gap at once rather than the first one it meets.
 */

import {
  catalogueProblems, offerIsReady, assertReady, catalogueForPrompt,
  shuffleForCompany, chooseOffer, FIT_MARGIN, type Offer,
} from '../offer-catalogue';

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 'cdo-as-a-service',
  commitment: 'retainer',
  name: 'CDO as a Service',
  one_line: 'A fractional Chief Data Officer for pharma manufacturers.',
  who_for: 'Mid-size pharma manufacturers with multiple plants.',
  problem: 'Data is trapped across plant, quality and commercial systems.',
  what_we_do: ['A single definition layer across plant and quality systems'],
  signals: ['More than one manufacturing site listed on the website'],
  disqualifiers: ['Trading or distribution only, with no manufacturing'],
  price_band: 'INR 3-6 lakh per month, 6 month engagement',
  proof: 'Delivered for two Hyderabad API manufacturers in 2025.',
  source: 'human',
  confirmed_at: '2026-08-15T00:00:00.000Z',
  ...over,
});

describe('catalogueProblems', () => {
  it('finds nothing wrong with a fully written offer', () => {
    expect(catalogueProblems([offer()])).toEqual([]);
    expect(offerIsReady(offer())).toBe(true);
  });

  // The two fields nobody can invent, and the reason the screen blocks.
  it('reports an empty proof', () => {
    expect(catalogueProblems([offer({ proof: '' })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/proof is empty/)]),
    );
  });

  it('reports an empty price band', () => {
    expect(catalogueProblems([offer({ price_band: '' })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/price_band is empty/)]),
    );
  });

  it('rejects text that is present but too short to score against', () => {
    // "TBD" passes a not-empty check and is worthless to a model.
    expect(catalogueProblems([offer({ proof: 'TBD' })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/too short to score against/)]),
    );
  });

  it('reports missing signals — fit scoring would have nothing to match on', () => {
    expect(catalogueProblems([offer({ signals: [] })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/signals is empty/)]),
    );
  });

  it('reports missing disqualifiers, because "no fit" must stay reachable', () => {
    expect(catalogueProblems([offer({ disqualifiers: [] })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/disqualifiers is empty/)]),
    );
  });

  it('reports a list entry too short to be useful', () => {
    expect(catalogueProblems([offer({ signals: ['big'] })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/too short to be useful/)]),
    );
  });

  it('reports duplicate offer ids', () => {
    expect(catalogueProblems([offer(), offer()])).toEqual(
      expect.arrayContaining([expect.stringMatching(/duplicate offer id/)]),
    );
  });

  // What makes the on-screen checklist usable instead of whack-a-mole.
  it('reports EVERY problem at once, across every offer', () => {
    const problems = catalogueProblems([
      offer({ name: 'First', proof: '', price_band: '' }),
      offer({ id: 'second', name: 'Second', signals: [] }),
    ]);
    expect(problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/First: proof is empty/),
      expect.stringMatching(/First: price_band is empty/),
      expect.stringMatching(/Second: signals is empty/),
    ]));
  });

  it('names the offer a problem belongs to, so the screen can point at it', () => {
    expect(catalogueProblems([offer({ name: 'CAIO as a Service', proof: '' })])[0])
      .toMatch(/^CAIO as a Service:/);
  });

  it('says so when there are no offers at all', () => {
    expect(catalogueProblems([])).toEqual(['No offers defined.']);
  });
});

describe('assertReady', () => {
  it('passes a complete catalogue silently', () => {
    expect(() => assertReady([offer()])).not.toThrow();
  });

  it('throws with every gap named, and says why it matters', () => {
    expect(() => assertReady([offer({ proof: '', price_band: '' })]))
      .toThrow(/OFFER_CATALOGUE_INCOMPLETE/);
    expect(() => assertReady([offer({ proof: '' })]))
      .toThrow(/decides who gets contacted/);
  });
});

describe('catalogueForPrompt', () => {
  const cat = { tenant_id: 't', offers: [offer()] };

  it('gives the model reasons to say no, not only reasons to say yes', () => {
    const text = catalogueForPrompt(cat);
    expect(text).toMatch(/Do NOT recommend this when:/);
    expect(text).toContain('Trading or distribution only');
  });

  it('carries the id the model must return', () => {
    expect(catalogueForPrompt(cat)).toContain('id: cdo-as-a-service');
  });

  it('carries proof and price, which are what make a fit judgement real', () => {
    const text = catalogueForPrompt(cat);
    expect(text).toContain('INR 3-6 lakh');
    expect(text).toContain('Hyderabad API manufacturers');
  });

  // commitment is the ladder rule's input, not the model's. Telling the model
  // how big an ask something is invites it to conflate "fits" with "sellable",
  // and we lose the ability to see which judgement was which.
  it('never tells the model how big an ask an offer is', () => {
    const text = catalogueForPrompt({
      tenant_id: 't',
      offers: [offer({ commitment: 'retainer' }), offer({ id: 'b', commitment: 'entry' })],
    });
    expect(text).not.toMatch(/retainer|commitment/i);
  });
});

/* ── Order ──────────────────────────────────────────────────────────── */

describe('shuffleForCompany', () => {
  const five = ['cdo', 'caio', 'audit', 'workshop', 'automations'].map((id) => ({ id }));

  it('gives the same company the same order every time', () => {
    expect(shuffleForCompany(five, '4021')).toEqual(shuffleForCompany(five, '4021'));
  });

  it('keeps every offer — this reorders, it does not sample', () => {
    const out = shuffleForCompany(five, '77').map((o) => o.id).sort();
    expect(out).toEqual([...five].map((o) => o.id).sort());
  });

  // The actual defect: one offer was first in every prompt in the batch and
  // won 4 of 5 companies by 0.03.
  it('does not put the same offer first for every company', () => {
    const firsts = new Set(
      Array.from({ length: 40 }, (_, i) => shuffleForCompany(five, String(i))[0].id),
    );
    expect(firsts.size).toBeGreaterThan(1);
  });

  it('is unaffected by the order it was given, so sort_order cannot leak in', () => {
    const reversed = [...five].reverse();
    expect(shuffleForCompany(five, '9')).toEqual(shuffleForCompany(reversed, '9'));
  });
});

/* ── The ladder ─────────────────────────────────────────────────────── */

describe('chooseOffer', () => {
  const offers = [
    { id: 'cdo', commitment: 'retainer' as const },
    { id: 'automations', commitment: 'project' as const },
    { id: 'audit', commitment: 'entry' as const },
    { id: 'workshop', commitment: 'entry' as const },
  ];

  // Biophore, from the first pilot run. Four offers spanning 0.13 — every gap
  // inside the noise, and a retainer "winning" by 0.03.
  it('opens with the smallest ask when everything fits about equally', () => {
    const c = chooseOffer([
      { offer_id: 'cdo', score: 0.81 },
      { offer_id: 'automations', score: 0.78 },
      { offer_id: 'workshop', score: 0.72 },
      { offer_id: 'audit', score: 0.68 },
    ], offers);

    expect(c.best).toBe('cdo');
    expect(c.recommended).toBe('workshop');   // entry rung, higher of the two
    expect(c.laddered_from).toBe('cdo');
    expect(c.margin).toBeCloseTo(0.03, 3);
    expect(c.unclear).toBe(true);
  });

  it('leaves a clear winner alone', () => {
    const c = chooseOffer([
      { offer_id: 'cdo', score: 0.9 },
      { offer_id: 'audit', score: 0.3 },
    ], offers);

    expect(c.best).toBe('cdo');
    expect(c.recommended).toBe('cdo');
    expect(c.laddered_from).toBeNull();
    expect(c.unclear).toBe(false);
  });

  it('only reaches down as far as the margin, never past it', () => {
    const c = chooseOffer([
      { offer_id: 'cdo', score: 0.9 },
      { offer_id: 'audit', score: 0.9 - FIT_MARGIN - 0.01 },
    ], offers);
    expect(c.recommended).toBe('cdo');
  });

  it('takes an entry offer exactly at the margin', () => {
    const c = chooseOffer([
      { offer_id: 'cdo', score: 0.9 },
      { offer_id: 'audit', score: 0.75 },
    ], offers);
    expect(c.recommended).toBe('audit');
  });

  it('prefers the lower rung over the higher score, that being the whole point', () => {
    const c = chooseOffer([
      { offer_id: 'automations', score: 0.7 },
      { offer_id: 'audit', score: 0.62 },
    ], offers);
    expect(c.recommended).toBe('audit');
  });

  it('ignores scores for offers that are not in the catalogue', () => {
    const c = chooseOffer([
      { offer_id: 'invented-offer', score: 0.99 },
      { offer_id: 'cdo', score: 0.5 },
    ], offers);
    expect(c.best).toBe('cdo');
    expect(c.recommended).toBe('cdo');
  });

  it('reports no margin when only one offer was scored', () => {
    const c = chooseOffer([{ offer_id: 'cdo', score: 0.7 }], offers);
    expect(c.margin).toBeNull();
    expect(c.unclear).toBe(false);
  });

  it('says nothing at all rather than guessing when nothing was scored', () => {
    expect(chooseOffer([], offers)).toEqual({
      best: null, recommended: null, margin: null, unclear: false, laddered_from: null,
    });
  });

  it('is deterministic when two offers tie exactly', () => {
    const a = chooseOffer([
      { offer_id: 'audit', score: 0.7 }, { offer_id: 'workshop', score: 0.7 },
    ], offers);
    const b = chooseOffer([
      { offer_id: 'workshop', score: 0.7 }, { offer_id: 'audit', score: 0.7 },
    ], offers);
    expect(a.recommended).toBe(b.recommended);
  });
});

describe('commitment validation', () => {
  it('rejects a rung the ladder rule does not recognise', () => {
    expect(catalogueProblems([offer({ commitment: 'cheap' as never })])).toEqual(
      expect.arrayContaining([expect.stringMatching(/commitment must be one of/)]),
    );
  });

  it('accepts all three rungs', () => {
    for (const c of ['entry', 'project', 'retainer'] as const) {
      expect(catalogueProblems([offer({ commitment: c })])).toEqual([]);
    }
  });
});
