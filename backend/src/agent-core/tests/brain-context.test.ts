/**
 * renderBrain — the budget, the priorities and the reporting, without a DB.
 * The loader's confirmed-only filters are covered by brain-context.db.test.ts.
 */
import { renderBrain, BrainContextError, type BrainData, type BrainProfile, type BrainNode } from '../brain.context';

const profile = (over: Partial<BrainProfile> = {}): BrainProfile => ({
  product_name: 'Acme', product_tagline: null, product_category: 'Invoicing',
  product_description: 'Invoices for plumbers', core_problem: 'Late payment',
  key_differentiators: ['Offline'], pricing_model: null, pricing_range: null,
  icp_role: 'Owner', icp_company_type: null, icp_company_size: null, icp_industry: 'Trades',
  icp_geography: null, primary_pain_points: ['cash flow'], gtm_stage: null,
  active_channels: null, current_mrr: null, team_size: null, vision_statement: null,
  target_market_size: null, approved_at: null, ...over,
});

const node = (label: string, name: string): BrainNode => ({ label, name, description: `about ${name}` });

const data = (over: Partial<BrainData> = {}): BrainData => ({
  profile: profile(),
  nodes: [],
  vocabulary: [],
  offers: [],
  brand: null,
  unconfirmed: { clusters: 0, offers: 0, brand: false },
  ...over,
});

const BIG = Number.MAX_SAFE_INTEGER;

describe('renderBrain', () => {
  it('refuses without a profile — the Brain is empty, not small', () => {
    expect(() => renderBrain(data({ profile: null }), 'deck', BIG))
      .toThrow(/PROFILE_NOT_FOUND/);
  });

  it('includes every section when there is room, in the purpose order', () => {
    const r = renderBrain(data({
      nodes: [node('Differentiator', 'Offline mode')],
      vocabulary: [{ cluster_type: 'category', primary_term: 'invoicing', related_terms: ['billing'] }],
      offers: [{ offer_key: 'core', name: 'Core', one_line: 'Invoices', who_for: 'Plumbers', problem: 'Late pay',
                 what_we_do: [], price_band: null, proof: null }],
      brand: { voice_tone: ['plain'], always_say: null, never_say: null, proof: null },
    }), 'deck', BIG);
    expect(r.included).toEqual(['profile', 'brand', 'offers', 'graph', 'vocabulary']);
    expect(r.trimmed).toBe(false);
    const order = ['PRODUCT', 'BRAND (approved)', 'OFFERS (confirmed)', 'KNOWLEDGE GRAPH', 'MARKET VOCABULARY']
      .map((h) => r.text.indexOf(h));
    expect(order.every((i, k) => i >= 0 && (k === 0 || i > order[k - 1]))).toBe(true);
    expect(r.missing).toEqual([]);
  });

  it('never presents an unconfirmed draft, and says it left it out', () => {
    const r = renderBrain(data({ unconfirmed: { clusters: 3, offers: 2, brand: true } }), 'deck', BIG);
    expect(r.text).not.toMatch(/OFFERS|BRAND|VOCABULARY/);
    expect(r.missing).toEqual([
      'vocabulary: 3 cluster(s) drafted, none approved',
      'offers: 2 drafted, none confirmed',
      'brand: drafted, not approved',
      'knowledge graph: nothing relevant yet',
    ]);
  });

  it('keeps graph nodes by label priority, drops the rest from the bottom, and tells the model', () => {
    const nodes = [
      ...Array.from({ length: 30 }, (_, i) => node('Team', `person ${i}`)),
      ...Array.from({ length: 5 }, (_, i) => node('Differentiator', `edge ${i}`)),
    ];
    const withAll = renderBrain(data({ nodes }), 'deck', BIG).text.length;
    const r = renderBrain(data({ nodes }), 'deck', withAll - 400);
    expect(r.text.length).toBeLessThanOrEqual(withAll - 400);
    expect(r.graph.eligible).toBe(35);
    // Differentiators outrank Team, so every one of them survives.
    for (let i = 0; i < 5; i++) expect(r.text).toContain(`edge ${i}`);
    expect(Object.keys(r.graph.droppedByLabel)).toEqual(['Team']);
    expect(r.graph.included + r.graph.droppedByLabel.Team).toBe(35);
    expect(r.text).toMatch(/further knowledge-graph entries exist and were not included/);
    expect(r.trimmed).toBe(true);
  });

  it('leaves out labels the purpose does not ask for', () => {
    const r = renderBrain(data({ nodes: [node('SomethingElse', 'x'), node('Metric', '40% faster')] }), 'deck', BIG);
    expect(r.graph.eligible).toBe(1);
    expect(r.text).not.toContain('[SomethingElse]');
  });

  it('drops a whole section that does not fit and reports it', () => {
    const offers = Array.from({ length: 20 }, (_, i) => ({
      offer_key: `o${i}`, name: `Offer ${i}`, one_line: 'x'.repeat(200), who_for: 'y', problem: 'z',
      what_we_do: [], price_band: null, proof: null,
    }));
    const profileLen = renderBrain(data(), 'deck', BIG).text.length;
    const r = renderBrain(data({
      offers, brand: { voice_tone: ['plain'], always_say: null, never_say: null, proof: null },
    }), 'deck', profileLen + 200);
    expect(r.included).toEqual(['profile', 'brand']);
    expect(r.droppedSections).toEqual(['offers']);
    expect(r.trimmed).toBe(true);
  });

  it('refuses with the numbers when the profile alone does not fit', () => {
    try {
      renderBrain(data(), 'deck', 20);
      throw new Error('expected a refusal');
    } catch (e) {
      expect(e).toBeInstanceOf(BrainContextError);
      expect((e as BrainContextError).code).toBe('BRAIN_CONTEXT_TOO_LARGE');
      expect((e as Error).message).toMatch(/only 20 fit/);
    }
  });

  it('reports whether the profile was approved', () => {
    expect(renderBrain(data(), 'deck', BIG).profileApproved).toBe(false);
    expect(renderBrain(data({ profile: profile({ approved_at: new Date() }) }), 'deck', BIG).profileApproved).toBe(true);
  });

  it('competitor_research: the gist — product and customer only, long fields clipped visibly', () => {
    const r = renderBrain(data({
      profile: profile({ product_description: 'x'.repeat(1000), gtm_stage: 'seed', vision_statement: 'world',
                         primary_pain_points: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }),
      vocabulary: [{ cluster_type: 'category', primary_term: 'invoicing', related_terms: ['billing'] }],
      offers: [{ offer_key: 'core', name: 'Core', one_line: 'x', who_for: 'y', problem: 'z',
                 what_we_do: [], price_band: null, proof: null }],
    }), 'competitor_research', BIG);
    expect(r.text).toContain(`Description: ${'x'.repeat(400)}…`);
    expect(r.text).not.toContain('x'.repeat(401));
    expect(r.text).toContain('Pain points: a, b, c, d, e');
    expect(r.text).not.toContain(', f');
    expect(r.text).not.toMatch(/GO-TO-MARKET|VISION|OFFERS/);
    expect(r.text).toContain('MARKET VOCABULARY (approved)\n- [category] invoicing: billing');
    expect(r.included).toEqual(['profile', 'vocabulary']);
    // Offers and brand are not this job's business, so their absence is not reported.
    expect(r.missing).toEqual([]);
  });

  it('competitor_research reports when the vocabulary did not fit, so the caller can say so', () => {
    const vocab = [{ cluster_type: 'category', primary_term: 'invoicing', related_terms: ['billing'] }];
    const profileLen = renderBrain(data(), 'competitor_check', BIG).text.length;
    const r = renderBrain(data({ vocabulary: vocab }), 'competitor_research', profileLen + 5);
    expect(r.included).toEqual(['profile']);
    expect(r.droppedSections).toEqual(['vocabulary']);
  });
});
