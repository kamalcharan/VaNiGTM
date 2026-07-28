/**
 * Offer catalogue validation.
 *
 * The point of these tests is the FAILURE cases. Fit scoring decides who gets
 * contacted, so a catalogue that is half-written must stop the run before any
 * account is crawled, not produce a confident number from a blank.
 */

import {
  validateCatalogue, catalogueForPrompt, loadOfferCatalogue, cataloguePath,
  type OfferCatalogue, type Offer,
} from '../offer-catalogue';
import fs from 'fs';

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

const catalogue = (offers: Offer[]): OfferCatalogue => ({
  tenant_slug: 'vikuna', tenant_label: 'Vikuna Technologies',
  segment: 'manufacturing/pharma', offers,
});

describe('validateCatalogue', () => {
  it('accepts a fully written offer', () => {
    expect(() => validateCatalogue(catalogue([offer()]), 'test')).not.toThrow();
  });

  it('rejects an empty proof — the field nobody can invent', () => {
    expect(() => validateCatalogue(catalogue([offer({ proof: '' })]), 'test'))
      .toThrow(/proof is empty/);
  });

  it('rejects an empty price band', () => {
    expect(() => validateCatalogue(catalogue([offer({ price_band: '' })]), 'test'))
      .toThrow(/price_band is empty/);
  });

  it('rejects text too short to score against', () => {
    // "TBD" passes a not-empty check and is worthless to a model.
    expect(() => validateCatalogue(catalogue([offer({ proof: 'TBD' })]), 'test'))
      .toThrow(/too short to score against/);
  });

  it('rejects missing signals — fit scoring would have nothing to match', () => {
    expect(() => validateCatalogue(catalogue([offer({ signals: [] })]), 'test'))
      .toThrow(/signals is empty/);
  });

  it('rejects missing disqualifiers, because "no fit" must be reachable', () => {
    expect(() => validateCatalogue(catalogue([offer({ disqualifiers: [] })]), 'test'))
      .toThrow(/disqualifiers is empty/);
  });

  it('rejects a list entry too short to be useful', () => {
    expect(() => validateCatalogue(catalogue([offer({ signals: ['big'] })]), 'test'))
      .toThrow(/too short to be useful/);
  });

  it('rejects duplicate offer ids', () => {
    expect(() => validateCatalogue(catalogue([offer(), offer()]), 'test'))
      .toThrow(/duplicate offer id/);
  });

  it('reports every problem at once, not the first', () => {
    try {
      validateCatalogue(catalogue([offer({ proof: '', price_band: '', signals: [] })]), 'test');
      throw new Error('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toMatch(/proof is empty/);
      expect(msg).toMatch(/price_band is empty/);
      expect(msg).toMatch(/signals is empty/);
    }
  });

  it('rejects a catalogue with no offers', () => {
    expect(() => validateCatalogue(catalogue([]), 'test')).toThrow(/no offers defined/);
  });
});

describe('catalogueForPrompt', () => {
  it('gives the model reasons to say no, not only reasons to say yes', () => {
    const text = catalogueForPrompt(catalogue([offer()]));
    expect(text).toMatch(/Do NOT recommend this when:/);
    expect(text).toContain('Trading or distribution only');
  });

  it('carries the id the model must return', () => {
    expect(catalogueForPrompt(catalogue([offer()]))).toContain('id: cdo-as-a-service');
  });
});

describe('loadOfferCatalogue', () => {
  it('names the missing file rather than failing obscurely', () => {
    expect(() => loadOfferCatalogue('does-not-exist'))
      .toThrow(/No catalogue for "does-not-exist"/);
  });

  it('the shipped vikuna draft parses and has the three offers', () => {
    // Deliberately NOT asserting it validates — price_band and proof are
    // empty by design until a human fills them, and the test that matters
    // is that loading it then fails loudly.
    const raw = JSON.parse(fs.readFileSync(cataloguePath('vikuna'), 'utf8')) as OfferCatalogue;
    expect(raw.offers.map((o) => o.id).sort())
      .toEqual(['ai-automations', 'caio-as-a-service', 'cdo-as-a-service']);
    expect(() => loadOfferCatalogue('vikuna')).toThrow(/not ready for fit scoring/);
  });
});
