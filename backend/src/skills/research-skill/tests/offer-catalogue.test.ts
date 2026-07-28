/**
 * Offer readiness.
 *
 * The point of these tests is the FAILURE cases. This validation is the only
 * thing between a half-written offer and a confident fit score that decides
 * who gets contacted — and it now drives a checklist on screen, so it has to
 * report EVERY gap at once rather than the first one it meets.
 */

import {
  catalogueProblems, offerIsReady, assertReady, catalogueForPrompt, type Offer,
} from '../offer-catalogue';

const offer = (over: Partial<Offer> = {}): Offer => ({
  id: 'cdo-as-a-service',
  name: 'CDO as a Service',
  one_line: 'A fractional Chief Data Officer for pharma manufacturers.',
  who_for: 'Mid-size pharma manufacturers with multiple plants.',
  problem: 'Data is trapped across plant, quality and commercial systems.',
  what_we_do: ['A single definition layer across plant and quality systems'],
  signals: ['More than one manufacturing site listed on the website'],
  disqualifiers: ['Trading or distribution only, with no manufacturing'],
  price_band: 'INR 3-6 lakh per month, 6 month engagement',
  proof: 'Delivered for two Hyderabad API manufacturers in 2025.',
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
});
