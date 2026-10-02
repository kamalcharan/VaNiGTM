/**
 * Mock-mode answers for scoring (no .env.local). Same shapes and rules as the
 * backend: weights must add up to 100, saving what is in force changes
 * nothing, levels stay the platform's.
 */
import type { Explained, PartKey, PartWeights, ProfileView } from './useScoring';

const V1: PartWeights = { identity: 20, firmographics: 20, digital: 10, contact: 20, people: 15, research: 10, signals: 5 };
const ITEMS: ProfileView['platform']['item_weights'] = {
  identity: { name: 4, anchor: 8, location: 4, type: 4 }, firmographics: { industry: 10, size: 4, description: 4, founded: 2 },
  digital: { domain: 4, site_verified: 3, social: 3 }, contact: { email: 8, phone: 6, address: 6 },
  people: { named: 8, titled: 7 }, research: { brief: 10 }, signals: { signal: 5 },
};
const PARTS: ProfileView['parts'] = [
  { key: 'identity', label: 'Identity', items: [{ key: 'name', label: 'A clean name' }, { key: 'anchor', label: 'An identity anchor' }, { key: 'location', label: 'A location' }, { key: 'type', label: 'Known to be a company' }] },
  { key: 'firmographics', label: 'Firmographics', items: [{ key: 'industry', label: 'Industry mapped' }, { key: 'size', label: 'Size known' }, { key: 'description', label: 'What it does, in a sentence' }, { key: 'founded', label: 'Year founded' }] },
  { key: 'digital', label: 'Digital presence', items: [{ key: 'domain', label: 'A website' }, { key: 'site_verified', label: 'Website checked live' }, { key: 'social', label: 'A company social profile' }] },
  { key: 'contact', label: 'Contact points', items: [{ key: 'email', label: 'A company email' }, { key: 'phone', label: 'A phone' }, { key: 'address', label: 'A postal address' }] },
  { key: 'people', label: 'People', items: [{ key: 'named', label: 'A named person' }, { key: 'titled', label: 'With a role or title' }] },
  { key: 'research', label: 'Research', items: [{ key: 'brief', label: 'Account researched' }] },
  { key: 'signals', label: 'Signals & response', items: [{ key: 'signal', label: 'A signal or a response' }] },
];
let own: { version: number; weights: PartWeights } | null = null;
let platformVersion = 1;
let platformWeights = V1;
const history: ProfileView['history'] = [{ scope: 'platform', version: 1, follows_platform: false, part_weights: V1, based_on_version: null, note: 'Platform default v1', saved_at: '2026-10-02T09:00:00.000Z', saved_by_name: null }];

const sum = (w: PartWeights) => Object.values(w).reduce((a, b) => a + Number(b), 0);
const view = (): ProfileView => ({
  in_force: own
    ? { scope: 'tenant', version: own.version, platform_version: platformVersion, own: true, based_on_version: 1, platform_changed: platformVersion > 1, part_weights: own.weights }
    : { scope: 'platform', version: platformVersion, platform_version: platformVersion, own: false, based_on_version: null, platform_changed: false, part_weights: platformWeights },
  platform: { version: platformVersion, part_weights: platformWeights, item_weights: ITEMS, level_bounds: { identified: 20, qualified: 40, reachable: 60, campaign_ready: 75, strong: 90 } },
  parts: PARTS, levels: (['raw', 'identified', 'qualified', 'reachable', 'campaign_ready', 'strong'] as const).map((k) => ({ key: k, label: k })),
  can_edit: true, can_edit_platform: true, history,
});

const explained: Explained = {
  score: 59, level: 'qualified', level_reason: null,
  parts: PARTS.map((p) => {
    const w = V1[p.key as PartKey];
    const earned: Record<PartKey, number> = { identity: 18, firmographics: 16, digital: 8, contact: 14, people: 0, research: 0, signals: 3 };
    return { key: p.key, label: p.label, weight: w, earned: earned[p.key], measured: p.key !== 'signals',
      items: p.items.map((it, i) => ({ ...it, weight: w / p.items.length, earned: i === 0 && earned[p.key] ? w / p.items.length : 0, evidence: i === 0 && earned[p.key] ? 'from your upload' : '' })) };
  }),
  profile: { scope: 'platform', version: 1, platform_version: 1 }, last_refreshed: '2026-10-02T09:00:00.000Z',
};

export const SCORING_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'scoring.profile': () => view(),
  'scoring.levels': () => ({
    tenant: { total: 480, unscored: 0, average: 46, by_level: { raw: 31, identified: 118, qualified: 251, reachable: 80, campaign_ready: 0, strong: 0 } },
    pool: { total: 3239, unscored: 0, average: 33, by_level: { raw: 1218, identified: 1333, qualified: 276, reachable: 412, campaign_ready: 0, strong: 0 } },
  }),
  'scoring.explain': () => explained,
};

export const SCORING_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'scoring.save_profile': (p) => {
    const w = p.part_weights as PartWeights;
    if (sum(w) !== 100) throw new Error(`the parts add up to ${sum(w)}; they must add up to 100`);
    const cur = own?.weights ?? platformWeights;
    if (Object.keys(w).every((k) => w[k as PartKey] === cur[k as PartKey])) return { version: own?.version ?? 0, changed: false };
    own = { version: (own?.version ?? 0) + 1, weights: w };
    history.unshift({ scope: 'tenant', version: own.version, follows_platform: false, part_weights: w, based_on_version: platformVersion, note: null, saved_at: new Date().toISOString(), saved_by_name: 'You (mock)' });
    return { version: own.version, changed: true };
  },
  'scoring.follow_platform': () => {
    if (!own) return { changed: false };
    history.unshift({ scope: 'tenant', version: own.version + 1, follows_platform: true, part_weights: null, based_on_version: null, note: 'back to the platform default', saved_at: new Date().toISOString(), saved_by_name: 'You (mock)' });
    own = null; return { changed: true };
  },
  'scoring.save_platform_profile': (p) => {
    const w = (p.part_weights as PartWeights) ?? platformWeights;
    if (sum(w) !== 100) throw new Error(`the parts add up to ${sum(w)}; they must add up to 100`);
    platformWeights = w; platformVersion += 1;
    history.unshift({ scope: 'platform', version: platformVersion, follows_platform: false, part_weights: w, based_on_version: null, note: null, saved_at: new Date().toISOString(), saved_by_name: 'You (mock)' });
    return { version: platformVersion };
  },
  'scoring.rescore': () => ({ event_id: 'mock-event' }),
};
