/**
 * UX-only mock catalog for Vara onboarding + first-JD.
 *
 * Charan's model, 2026-08-17: onboarding is a DOORWAY to JD Studio; family
 * playbooks are DERIVED from the first JD, not asked upfront. Weights,
 * knockouts, thresholds live in JD Studio, not in onboarding. This mock
 * reflects that — the playbook fixtures no longer carry numeric defaults.
 */

export interface RoleFamilySeed {
  name: string;
  hint: string; // one-liner shown as chip subtitle
  suggested_titles: string[]; // pre-fills for the role title input
}

export const MOCK_TENANT_INDUSTRY = 'Technology & SaaS';

/**
 * What Smart Profile would give the inheritance card in the real build.
 * The visible surface is deliberately factual and visual — colors, name,
 * a verbatim quote — NOT self-describing adjectives like "brand voice".
 */
export const MOCK_TENANT_BRAND = {
  name: 'Vikuna Technologies',
  industry: 'Technology & SaaS',
  domain: 'vikuna.io · workspace',
  colors: { primary: '#c9a227', secondary: '#141414', accent: '#eae6da' },
  site_quote: 'Rules reject. Models rank. Humans decide.',
};

export const MOCK_ROLE_FAMILIES: RoleFamilySeed[] = [
  {
    name: 'Backend Engineering',
    hint: 'Ships services, owns data models',
    suggested_titles: ['Senior Backend Engineer', 'Staff Backend Engineer', 'Backend Tech Lead'],
  },
  {
    name: 'Frontend Engineering',
    hint: 'Ships product surfaces end-to-end',
    suggested_titles: ['Senior Frontend Engineer', 'Frontend Tech Lead'],
  },
  {
    name: 'Product & Design',
    hint: 'Owns problem framing, ships craft',
    suggested_titles: ['Senior Product Designer', 'Product Manager'],
  },
];

/**
 * The mock JD Studio composer script — Vara's questions and the tenant's
 * pickable answers. In the real build this is an LLM conversation; in the
 * preview it is a scripted flow so Charan can click through the shape.
 *
 * Each step's picks contribute STRUCTURED FACTS to the JD panel on the right
 * — the "playbook controls" (weights, knockouts, threshold) emerge here, not
 * in onboarding.
 */
export interface JdStudioStep {
  ask: string;
  chips: { label: string; contributes: Record<string, unknown> }[];
}

export function jdScriptFor(family: string, title: string): JdStudioStep[] {
  // Family-specific colouring is where real seed playbooks would diverge.
  // For the preview, one script covers all three families sensibly.
  return [
    {
      ask: `Great — let's shape ${title}. In one line, what does this role do?`,
      chips: [
        { label: `Ships ${family.toLowerCase()} for our platform`, contributes: { one_liner: `Ships ${family.toLowerCase()} for our platform` } },
        { label: 'Owns a domain end-to-end', contributes: { one_liner: 'Owns a domain end-to-end' } },
        { label: 'Ships product features across the stack', contributes: { one_liner: 'Ships product features across the stack' } },
      ],
    },
    {
      ask: 'What must be true for someone to succeed? Pick the strongest signal — I will weight it heaviest.',
      chips: [
        { label: 'TypeScript / Node.js in production', contributes: { top_musthave: { name: 'TypeScript + Node.js', weight: 40 } } },
        { label: 'PostgreSQL row-level security', contributes: { top_musthave: { name: 'PostgreSQL + RLS', weight: 40 } } },
        { label: 'Distributed systems experience', contributes: { top_musthave: { name: 'Distributed systems', weight: 40 } } },
      ],
    },
    {
      ask: 'Add up to two more must-haves — I will weight them behind the first.',
      chips: [
        { label: 'Cloud deploy (AWS/GCP)', contributes: { addl_musthave: { name: 'Cloud deploy', weight: 25 } } },
        { label: 'Testing culture (unit + integration)', contributes: { addl_musthave: { name: 'Testing rigor', weight: 25 } } },
        { label: '5+ years experience', contributes: { addl_musthave: { name: '≥ 5 yrs experience', weight: 20 } } },
      ],
    },
    {
      ask: 'Notice period tolerance? This becomes a knockout — deterministic, never scored.',
      chips: [
        { label: '≤ 30 days', contributes: { knockout: { label: 'Notice period', rule: '≤ 30 days' } } },
        { label: '≤ 60 days', contributes: { knockout: { label: 'Notice period', rule: '≤ 60 days' } } },
        { label: 'Flexible — no knockout', contributes: {} },
      ],
    },
    {
      ask: 'Compensation band? I will state it up front in the chat so candidates know.',
      chips: [
        { label: '₹25 – 35 L', contributes: { knockout: { label: 'Comp band', rule: '≤ ₹35 L' }, band: '₹25 – 35 L' } },
        { label: '₹32 – 45 L', contributes: { knockout: { label: 'Comp band', rule: '≤ ₹45 L' }, band: '₹32 – 45 L' } },
        { label: '₹40 – 60 L', contributes: { knockout: { label: 'Comp band', rule: '≤ ₹60 L' }, band: '₹40 – 60 L' } },
      ],
    },
    {
      ask: 'Handover threshold — how confident does the score need to be before I hand a candidate to your team?',
      chips: [
        { label: 'Strict (35%)', contributes: { threshold: 35 } },
        { label: 'Standard (30%) — my default', contributes: { threshold: 30 } },
        { label: 'Wider (25%)', contributes: { threshold: 25 } },
      ],
    },
  ];
}

/**
 * Session-scoped "live" flag — set when the first JD is published in the
 * UX preview, cleared on tab close.
 */
export const UX_DONE_KEY = 'vara-onboarding-ux-done';

/**
 * Mock extraction result — what the LLM would produce for an uploaded JD.
 * Facts + provenance ("from your file") + confidence per field. Used to
 * populate the import review panel deterministically for the UX preview.
 */
export interface Provenance {
  source: string;    // e.g. "senior-backend-eng.pdf, page 1"
  span?: string;     // e.g. "line 24: 'Notice period ≤ 60 days'"
  confidence: 'high' | 'medium' | 'low';
}

export interface ExtractedFact<T> {
  value: T;
  from: Provenance;
}

export interface MockExtractedJd {
  filename: string;
  role_summary: ExtractedFact<string>;
  musthaves: ExtractedFact<{ name: string; weight: number }>[];
  knockouts: ExtractedFact<{ label: string; rule: string }>[];
  band: ExtractedFact<string> | null;
  threshold_suggested: number;
}

export function mockExtractionFor(filename: string, family: string, title: string): MockExtractedJd {
  const base = filename.split('.')[0] || 'existing-jd';
  const isBackend = family === 'Backend Engineering';
  return {
    filename,
    role_summary: {
      value: `Ships ${family.toLowerCase()} for the platform end to end`,
      from: { source: `${base}, page 1`, span: 'first paragraph', confidence: 'medium' },
    },
    musthaves: isBackend ? [
      {
        value: { name: 'TypeScript + Node.js', weight: 40 },
        from: { source: `${base}, page 2`, span: '"5+ years TypeScript / Node.js"', confidence: 'high' },
      },
      {
        value: { name: 'PostgreSQL row-level security', weight: 25 },
        from: { source: `${base}, page 2`, span: '"production RLS experience"', confidence: 'high' },
      },
      {
        value: { name: 'Distributed systems', weight: 20 },
        from: { source: `${base}, page 2`, span: '"has designed distributed systems"', confidence: 'medium' },
      },
      {
        value: { name: 'Cloud deploy (AWS/GCP)', weight: 15 },
        from: { source: `${base}, page 2`, span: 'nice-to-have list', confidence: 'low' },
      },
    ] : [
      {
        value: { name: `Senior ${family} craft`, weight: 40 },
        from: { source: `${base}, page 1`, span: 'first requirement', confidence: 'high' },
      },
      {
        value: { name: '5+ years experience', weight: 30 },
        from: { source: `${base}, page 2`, span: '"5+ years"', confidence: 'high' },
      },
      {
        value: { name: 'Team leadership', weight: 20 },
        from: { source: `${base}, page 3`, span: 'nice-to-have', confidence: 'medium' },
      },
    ],
    knockouts: [
      {
        value: { label: 'Notice period', rule: '≤ 60 days' },
        from: { source: `${base}, page 3`, span: '"immediate joiners preferred, ≤ 60 days"', confidence: 'high' },
      },
      {
        value: { label: 'Work authorization', rule: 'India' },
        from: { source: `${base}, page 3`, span: '"India work authorization required"', confidence: 'high' },
      },
    ],
    band: {
      value: isBackend ? '₹32–45 L' : '₹25–38 L',
      from: { source: `${base}, page 1`, span: 'salary line', confidence: 'high' },
    },
    threshold_suggested: 30,
  };
}

/** Session-scoped: how many JDs a tenant has published in the preview so
 *  the "apply as family default?" prompt can fire at the right moment.
 *  Facts are carried so Duplicate/Edit can prefill JD Studio and so the
 *  family-defaults diff has real content to intersect. */
export const UX_PUBLISHED_JDS_KEY = 'vara-ux-published-jds';

/** Session-scoped: a JD payload the composer picks up when the tenant
 *  clicks Duplicate or Edit on the doorway list. Composer clears it after
 *  hydrating so a refresh doesn't re-hydrate stale state. */
export const UX_DRAFT_KEY = 'vara-ux-jd-draft';

/**
 * Employment shape. `work_mode` is derived from `onsite_pct` rather than stored
 * beside it — one source of truth, so the two can never disagree. 0 = fully
 * remote, 100 = fully on-site, anything between is hybrid, which is why the
 * control is a slider and not three radio buttons: hybrid is the common case
 * and "3 days in" is a percentage, not a fourth category.
 */
export type EmploymentType = 'full_time' | 'part_time' | 'freelance';

export const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'freelance', label: 'Freelance / contract' },
];

/** The words a human uses for a percentage. Ends are absolutes, not "95% ish". */
export function workModeLabel(onsitePct: number | undefined): string {
  if (onsitePct === undefined) return '—';
  if (onsitePct <= 0) return 'Fully remote';
  if (onsitePct >= 100) return 'Fully on-site';
  return `Hybrid — ${onsitePct}% on-site`;
}

export interface PublishedFacts {
  one_liner?: string;
  /**
   * The human-readable posting — what a candidate reads before applying.
   *
   * Distinct from the scoring contract (must_haves / knockouts / threshold),
   * which is what Vara evaluates against. Both are "the JD", and keeping them
   * in one versioned object is deliberate: a posting that promises something
   * the weights do not reflect is how a candidate ends up scored against
   * something they never read.
   *
   * Versioned with the rest of facts, because it is what the candidate saw.
   */
  description?: string;
  band?: string;
  threshold?: number;
  /**
   * The employment CONTRACT — what the role is. Versioned with everything else
   * in vara_jd_version.facts, because a candidate was scored against it.
   *
   * Note what is deliberately NOT here: the number of open positions. That is
   * operational state, and vara_jd_version is immutable — filling a seat must
   * not mint v2 and strand every in-flight application on a superseded
   * version. Positions land as their own mutable table in Phase 5, where
   * vara_application can point at the one a candidate applied to.
   */
  employment_type?: EmploymentType;
  /** 0 = fully remote · 100 = fully on-site. Undefined = not stated. */
  onsite_pct?: number;
  /** Where the role sits. Free text per entry — "Hyderabad", "Remote (India)". */
  locations?: string[];
  musthaves: { name: string; weight: number }[];
  knockouts: { label: string; rule: string }[];
}

export interface PublishedJd {
  id: string;       // stable per JD identity; Duplicate mints a new one, Edit reuses
  family: string;
  title: string;
  version: number;  // starts at 1; Edit → publish becomes v2, v3…
  facts: PublishedFacts;
}

export interface DraftJd {
  id: string;             // reused on Edit (produces v+1), fresh on Duplicate (v1 of new JD)
  family: string;
  title: string;
  facts: PublishedFacts;
  mode: 'duplicate' | 'edit';
  baseVersion: number;    // the version being copied from; edits publish as baseVersion+1
}

export function readPublishedJds(): PublishedJd[] {
  try {
    const raw = sessionStorage.getItem(UX_PUBLISHED_JDS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    // Legacy shape ({family,title} only) — coerce so an older session doesn't crash the UI.
    return arr.map((r, i) => {
      const row = r as Partial<PublishedJd> & { family?: string; title?: string };
      return {
        id: row.id ?? `legacy-${i}`,
        family: row.family ?? 'Unknown',
        title: row.title ?? 'Untitled',
        version: row.version ?? 1,
        facts: row.facts ?? { musthaves: [], knockouts: [] },
      };
    });
  } catch { return []; }
}

export function writePublishedJds(list: PublishedJd[]) {
  try { sessionStorage.setItem(UX_PUBLISHED_JDS_KEY, JSON.stringify(list)); } catch { /* private mode */ }
}

/**
 * Family playbook derivation: given every JD published in a family, take
 * the must-haves that appear across ALL of them (intersection by name;
 * weight is the arithmetic mean) and the knockouts that appear across ALL
 * of them (intersection by label). Threshold defaults to the arithmetic
 * mean of the JDs' thresholds. Real spec is statistical/frequency-weighted
 * over N JDs; the intersection is the preview approximation that shows
 * the pattern honestly with N=2.
 */
export interface DerivedFamilyDefaults {
  musthaves: { name: string; weight: number; in: number; of: number }[];
  knockouts: { label: string; rule: string; in: number; of: number }[];
  threshold?: number;
  band_range?: string;
}

export function deriveFamilyDefaults(jds: PublishedJd[]): DerivedFamilyDefaults {
  if (jds.length === 0) return { musthaves: [], knockouts: [] };
  const n = jds.length;
  const mustCounts = new Map<string, { in: number; weights: number[] }>();
  const knockCounts = new Map<string, { in: number; rules: string[] }>();
  for (const jd of jds) {
    const seenM = new Set<string>();
    for (const m of jd.facts.musthaves) {
      if (seenM.has(m.name)) continue;
      seenM.add(m.name);
      const cur = mustCounts.get(m.name) ?? { in: 0, weights: [] };
      cur.in += 1;
      cur.weights.push(m.weight);
      mustCounts.set(m.name, cur);
    }
    const seenK = new Set<string>();
    for (const k of jd.facts.knockouts) {
      if (seenK.has(k.label)) continue;
      seenK.add(k.label);
      const cur = knockCounts.get(k.label) ?? { in: 0, rules: [] };
      cur.in += 1;
      cur.rules.push(k.rule);
      knockCounts.set(k.label, cur);
    }
  }
  const musthaves = Array.from(mustCounts.entries())
    .filter(([, v]) => v.in === n)
    .map(([name, v]) => ({
      name,
      weight: Math.round(v.weights.reduce((a, b) => a + b, 0) / v.weights.length),
      in: v.in,
      of: n,
    }))
    .sort((a, b) => b.weight - a.weight);
  const knockouts = Array.from(knockCounts.entries())
    .filter(([, v]) => v.in === n)
    .map(([label, v]) => ({
      label,
      rule: v.rules[0], // pick the first — real spec would pick the most permissive
      in: v.in,
      of: n,
    }));
  const thresholds = jds.map((j) => j.facts.threshold).filter((t): t is number => typeof t === 'number');
  const threshold = thresholds.length ? Math.round(thresholds.reduce((a, b) => a + b, 0) / thresholds.length) : undefined;
  const bands = jds.map((j) => j.facts.band).filter((b): b is string => typeof b === 'string');
  const band_range = bands.length ? bands.join(' · ') : undefined;
  return { musthaves, knockouts, threshold, band_range };
}
