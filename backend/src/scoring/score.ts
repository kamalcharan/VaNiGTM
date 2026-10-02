/**
 * The 0–100 readiness score — a pure function, the same for a pool company and
 * for a tenant's own copy (POA D-Q4–D-Q7, decided 2026-10-02).
 *
 *   Identity 20 · Firmographics 20 · Digital presence 10 · Contact points 20
 *   · People 15 · Research 10 · Signals & response 5
 *
 * Each part is earned by named ITEMS, each a piece of evidence read from a
 * named field — so "why is this 59?" is always answerable, item by item. The
 * WEIGHTS come from a scoring profile (gt_score_profiles, S17): the parts'
 * weights from the tenant's own profile or the platform default, the split
 * inside each part from the platform default only.
 *
 * Levels (platform boundaries): raw · identified · qualified · reachable ·
 * campaign_ready · strong. Two of them are gated, not just scored:
 *   qualified and above   the company passes the Complete test
 *   campaign_ready, strong the Exit gate passes (a named person, a lawful
 *                          basis, a verified channel — D-Q6). People arrive in
 *                          P7, so today no company can pass it, and the level
 *                          SAYS so instead of pretending.
 *
 * Freshness is not scored (D-Q8); "last refreshed" is shown beside it.
 * People, research and signals are the tenant's relationship with a company:
 * a pool company earns none of them, so it tops out near 70 — by design.
 */

export const PART_KEYS = ['identity', 'firmographics', 'digital', 'contact', 'people', 'research', 'signals'] as const;
export type PartKey = typeof PART_KEYS[number];

export const LEVEL_KEYS = ['raw', 'identified', 'qualified', 'reachable', 'campaign_ready', 'strong'] as const;
export type Level = typeof LEVEL_KEYS[number];

/** What a profile carries (gt_score_profiles, resolved — see profiles.ts). */
export interface ScoreProfile {
  scope: 'platform' | 'tenant';
  version: number;
  /** The platform version the item weights and levels came from. */
  platformVersion: number;
  partWeights: Record<PartKey, number>;
  itemWeights: Record<PartKey, Record<string, number>>;
  levelBounds: Record<Exclude<Level, 'raw'>, number>;
}

/** The facts a score reads. Every field optional: a source gives what it gives. */
export interface ScoreInput {
  name?: string | null;
  cin?: string | null; llpin?: string | null; gstin?: string | null;
  domain_normalized?: string | null;
  /** found · none_found · not_tried — "found" means the site was checked. */
  domain_status?: string | null;
  city?: string | null; state_code?: string | null; pin?: string | null; address_line?: string | null;
  is_individual?: boolean | null;
  industry_id?: number | null; nic_codes?: string[] | null;
  employees_band?: string | null; revenue_band?: string | null;
  description?: string | null; year_founded?: number | null;
  linkedin_url?: string | null; twitter_url?: string | null; facebook_url?: string | null;
  email?: string | null; role_emails?: string[] | null;
  phone?: string | null; phones?: string[] | null;
  /** Passed the Complete test (pool: lifecycle complete). */
  complete?: boolean;
  /** Tenant side: named contacts at this company, and how many carry a title. */
  people_named?: number; people_titled?: number;
  /** Tenant side: an account brief exists. */
  researched?: boolean;
  /** A dated signal (exhibitor, new registration…) or a response. P4 brings signals. */
  signals?: number;
  /** The Exit gate (D-Q6). Never true before P7 — nothing can evidence it. */
  exit_gate?: boolean;
}

export interface ItemResult { key: string; label: string; weight: number; earned: number; evidence: string }
export interface PartResult { key: PartKey; label: string; weight: number; earned: number; items: ItemResult[]; measured: boolean }
export interface ScoreResult {
  score: number;
  level: Level;
  /** Why the level is what it is when the score alone would say more. */
  level_reason: string | null;
  parts: PartResult[];
  profile: { scope: 'platform' | 'tenant'; version: number; platform_version: number };
}

export const PART_LABEL: Record<PartKey, string> = {
  identity: 'Identity', firmographics: 'Firmographics', digital: 'Digital presence',
  contact: 'Contact points', people: 'People', research: 'Research', signals: 'Signals & response',
};
export const LEVEL_LABEL: Record<Level, string> = {
  raw: 'Raw', identified: 'Identified', qualified: 'Qualified', reachable: 'Reachable',
  campaign_ready: 'Campaign-ready', strong: 'Strong',
};

const has = (v: unknown) => typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.some((x) => String(x ?? '').trim()) : v != null;
const PLACEHOLDER = /^(test|testing|dummy|sample|demo|n\/?a|na|nil|null|none|unknown|xxx+|[-–—.\s_*#]+)$/i;

type Rule = { label: string; check: (i: ScoreInput) => string | null };

/**
 * The items, by part: what earns each, and the evidence it reports. The
 * WEIGHT of each item is the platform profile's (item_weights); an item the
 * profile does not weight earns nothing.
 */
export const ITEMS: Record<PartKey, Record<string, Rule>> = {
  identity: {
    name: { label: 'A clean name', check: (i) => (has(i.name) && !PLACEHOLDER.test(String(i.name).trim()) ? String(i.name) : null) },
    anchor: { label: 'An identity anchor', check: (i) =>
      i.cin ? `CIN ${i.cin}` : i.llpin ? `LLPIN ${i.llpin}` : i.gstin ? `GSTIN ${i.gstin}`
        : i.domain_normalized && i.domain_status === 'found' ? `domain ${i.domain_normalized}`
          : has(i.name) && i.pin ? `name + PIN ${i.pin}` : null },
    location: { label: 'A location', check: (i) => (i.city || i.state_code ? [i.city, i.state_code].filter(Boolean).join(', ') : null) },
    type: { label: 'Known to be a company', check: (i) => (i.is_individual === false ? 'a company, not an individual' : null) },
  },
  firmographics: {
    industry: { label: 'Industry mapped', check: (i) =>
      i.industry_id ? `category #${i.industry_id}` : (i.nic_codes ?? []).filter(Boolean).length ? `NIC ${(i.nic_codes ?? []).join(', ')}` : null },
    size: { label: 'Size known', check: (i) => i.employees_band || i.revenue_band || null },
    description: { label: 'What it does, in a sentence', check: (i) => (has(i.description) && String(i.description).trim().length >= 40 ? 'described' : null) },
    founded: { label: 'Year founded', check: (i) => (i.year_founded ? String(i.year_founded) : null) },
  },
  digital: {
    domain: { label: 'A website', check: (i) => i.domain_normalized || null },
    site_verified: { label: 'Website checked live', check: (i) => (i.domain_status === 'found' && i.domain_normalized ? 'checked' : null) },
    social: { label: 'A company social profile', check: (i) => i.linkedin_url || i.twitter_url || i.facebook_url || null },
  },
  contact: {
    email: { label: 'A company email', check: (i) => (has(i.role_emails) ? (i.role_emails ?? [])[0] : i.email || null) },
    phone: { label: 'A phone', check: (i) => (has(i.phones) ? (i.phones ?? [])[0] : i.phone || null) },
    address: { label: 'A postal address', check: (i) => (i.address_line || i.pin ? [i.address_line, i.pin].filter(Boolean).join(' ') : null) },
  },
  people: {
    named: { label: 'A named person', check: (i) => ((i.people_named ?? 0) > 0 ? `${i.people_named} named` : null) },
    titled: { label: 'With a role or title', check: (i) => ((i.people_titled ?? 0) > 0 ? `${i.people_titled} with a title` : null) },
  },
  research: {
    brief: { label: 'Account researched', check: (i) => (i.researched ? 'brief written' : null) },
  },
  signals: {
    signal: { label: 'A signal or a response', check: (i) => ((i.signals ?? 0) > 0 ? `${i.signals} signal(s)` : null) },
  },
};

/** Parts no source can evidence yet — shown as "not measured yet", never as a quiet zero. */
const NOT_YET: Partial<Record<PartKey, string>> = { signals: 'signals arrive with P4' };

export function computeScore(input: ScoreInput, profile: ScoreProfile, opts: { pool?: boolean } = {}): ScoreResult {
  const parts: PartResult[] = PART_KEYS.map((key) => {
    const weight = Number(profile.partWeights[key] ?? 0);
    const itemW = profile.itemWeights[key] ?? {};
    const itemTotal = Object.values(itemW).reduce((a, b) => a + Number(b || 0), 0);
    const items: ItemResult[] = Object.entries(ITEMS[key]).map(([ik, rule]) => {
      const w = itemTotal > 0 ? (Number(itemW[ik] ?? 0) / itemTotal) * weight : 0;
      const evidence = rule.check(input);
      return { key: ik, label: rule.label, weight: round1(w), earned: evidence ? round1(w) : 0, evidence: evidence ?? '' };
    });
    const earned = Math.min(weight, items.reduce((a, it) => a + it.earned, 0));
    // A tenant-side part on a pool company, or a part nothing feeds yet, is
    // labelled — a zero there is not a gap to fill.
    const measured = !(opts.pool && (key === 'people' || key === 'research' || key === 'signals')) && !NOT_YET[key];
    return { key, label: PART_LABEL[key], weight, earned: round1(earned), items, measured };
  });
  const score = Math.max(0, Math.min(100, Math.round(parts.reduce((a, p) => a + p.earned, 0))));

  const b = profile.levelBounds;
  let level: Level = 'raw';
  for (const l of ['identified', 'qualified', 'reachable', 'campaign_ready', 'strong'] as const) if (score >= b[l]) level = l;
  let reason: string | null = null;
  if ((level === 'campaign_ready' || level === 'strong') && !input.exit_gate) {
    level = 'reachable';
    reason = 'Campaign-ready needs the Exit gate — a named person, a lawful basis and a verified channel. People come with P7.';
  }
  if (rank(level) >= rank('qualified') && !input.complete) {
    level = 'identified';
    reason = 'Qualified needs the Complete test passed first.';
  }
  return {
    score, level, level_reason: reason, parts,
    profile: { scope: profile.scope, version: profile.version, platform_version: profile.platformVersion },
  };
}

const rank = (l: Level) => LEVEL_KEYS.indexOf(l);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Validate a tenant's (or the admin's) part weights: all seven, whole numbers ≥ 0, summing to 100. */
export function checkPartWeights(w: unknown): string[] {
  const problems: string[] = [];
  if (!w || typeof w !== 'object') return ['part weights are required'];
  const o = w as Record<string, unknown>;
  for (const k of PART_KEYS) {
    const v = o[k];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100) problems.push(`${PART_LABEL[k]} must be a whole number 0–100`);
  }
  const extra = Object.keys(o).filter((k) => !(PART_KEYS as readonly string[]).includes(k));
  if (extra.length) problems.push(`unknown parts: ${extra.join(', ')}`);
  if (!problems.length) {
    const sum = PART_KEYS.reduce((a, k) => a + (o[k] as number), 0);
    if (sum !== 100) problems.push(`the parts add up to ${sum}; they must add up to 100`);
  }
  return problems;
}

/** Validate platform level boundaries: five, increasing, within 1–100. */
export function checkLevelBounds(b: unknown): string[] {
  if (!b || typeof b !== 'object') return ['level boundaries are required'];
  const o = b as Record<string, unknown>;
  const order = ['identified', 'qualified', 'reachable', 'campaign_ready', 'strong'];
  const vals = order.map((k) => o[k]);
  if (vals.some((v) => typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 100)) return ['each level boundary must be a whole number 1–100'];
  for (let i = 1; i < vals.length; i++) if ((vals[i] as number) <= (vals[i - 1] as number)) return [`${order[i]} must start above ${order[i - 1]}`];
  return [];
}
