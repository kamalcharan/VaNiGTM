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
 *  the "apply as family default?" prompt can fire at the right moment. */
export const UX_PUBLISHED_JDS_KEY = 'vara-ux-published-jds';
