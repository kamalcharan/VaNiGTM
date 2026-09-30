/**
 * renderBrain — without a database.
 *
 * The first block is the one that matters: moving an agent onto brain.context
 * must not change what it sends the model. The storyteller's old builder is
 * kept verbatim in fixtures/ and compared character for character.
 */
import { renderBrain, BrainContextError, type BrainData, type BrainProfile, type BrainNode } from '../brain.context';
import { oldDeckContext } from './fixtures/storyteller-v1-context';
import type { TenantProfile } from '../../skills/profile-skill/profile.service';
import type { KGNode } from '../kg.store';

const profile = (over: Partial<BrainProfile> = {}): BrainProfile => ({
  product_name: 'Acme', product_tagline: 'Paid on time', product_category: 'Invoicing',
  product_description: 'Invoices for plumbers', core_problem: 'Late payment',
  key_differentiators: ['Offline', 'WhatsApp reminders'], pricing_model: 'subscription', pricing_range: '₹999/mo',
  icp_role: 'Owner', icp_company_type: 'Trade business', icp_company_size: '1-10', icp_industry: 'Trades',
  icp_geography: 'India', primary_pain_points: ['cash flow', 'chasing'], gtm_stage: 'seed',
  active_channels: ['WhatsApp'], current_mrr: '₹2L', team_size: 4, vision_statement: 'No unpaid plumber',
  target_market_size: '5M', ...over,
});

const node = (label: string, name: string, description: string | null = `about ${name}`): BrainNode =>
  ({ label, name, description });

const data = (over: Partial<BrainData> = {}): BrainData =>
  ({ profile: profile(), nodes: [], vocabulary: [], ...over });

/** The old builder took full rows; only the fields it read matter. */
const asOld = (p: BrainProfile, nodes: BrainNode[]) => ({
  p: p as unknown as TenantProfile,
  n: nodes as unknown as KGNode[],
});

const BIG = Number.MAX_SAFE_INTEGER;

describe('deck — identical to what the storyteller sent before', () => {
  let log: jest.SpyInstance;
  beforeAll(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterAll(() => log.mockRestore());

  const nodes = Array.from({ length: 40 }, (_, i) =>
    node(i % 3 ? 'Feature' : 'Differentiator', `item ${String(i).padStart(2, '0')}`, i % 5 ? `does ${i}` : null));

  const cases: Array<[string, BrainProfile, BrainNode[]]> = [
    ['full profile, no nodes', profile(), []],
    ['full profile, 40 nodes', profile(), nodes],
    ['sparse profile (nulls, empty lists, blanks)', profile({
      product_tagline: null, pricing_model: null, pricing_range: '  ', key_differentiators: [],
      icp_company_size: null, primary_pain_points: null, gtm_stage: null, active_channels: [],
      current_mrr: null, team_size: null, vision_statement: null, target_market_size: null,
    }), nodes.slice(0, 5)],
    ['every profile field empty', profile(Object.fromEntries(
      Object.keys(profile()).map((k) => [k, null])) as unknown as BrainProfile), nodes.slice(0, 3)],
  ];

  it.each(cases)('%s — untrimmed', (_name, p, n) => {
    const { p: op, n: on } = asOld(p, n);
    expect(renderBrain(data({ profile: p, nodes: n }), 'deck', BIG).text).toBe(oldDeckContext(op, on, BIG));
  });

  it.each(cases)('%s — at every room size the old code fitted', (_name, p, n) => {
    const { p: op, n: on } = asOld(p, n);
    const full = oldDeckContext(op, on, BIG).length;
    const profileLen = renderBrain(data({ profile: p }), 'deck', BIG).text.length;
    // From "profile + trim note barely fits" up to "everything fits".
    for (let room = profileLen + 160; room <= full + 10; room += 97) {
      expect(renderBrain(data({ profile: p, nodes: n }), 'deck', room).text).toBe(oldDeckContext(op, on, room));
    }
  });
});

describe('renderBrain — budget and reporting', () => {
  let log: jest.SpyInstance;
  beforeAll(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterAll(() => log.mockRestore());

  it('refuses without a profile — the Brain is empty, not small', () => {
    expect(() => renderBrain(data({ profile: null }), 'deck', BIG)).toThrow(/PROFILE_NOT_FOUND/);
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

  it('reports dropped graph nodes, and tells the model', () => {
    const nodes = Array.from({ length: 30 }, (_, i) => node('Feature', `f${i}`));
    const full = renderBrain(data({ nodes }), 'deck', BIG).text.length;
    const r = renderBrain(data({ nodes }), 'deck', full - 300);
    // The nodes fit the room; the note is appended after (the old storyteller
    // rule), so the text may exceed it by the note alone — inside the slack.
    const note = r.text.slice(r.text.lastIndexOf('\n\n[') + 2);
    expect(r.text.length - note.length - 2).toBeLessThanOrEqual(full - 300);
    expect(note.length).toBeLessThan(200);
    expect(r.graph.total).toBe(30);
    expect(r.graph.included).toBeLessThan(30);
    expect(r.trimmed).toBe(true);
    expect(r.text).toMatch(/\[\d+ further knowledge-graph entries exist and were not included/);
  });
});
