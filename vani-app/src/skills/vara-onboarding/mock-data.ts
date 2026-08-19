/**
 * UX-only mock catalog for Vara onboarding.
 *
 * IMPORTANT — this file is scaffolding for the design review, NOT the shape
 * the real feature will land on. It exists so Charan can navigate the flow
 * end to end and react to it before any backend is wired. The actual data
 * source is vani_domain_pack payloads (per the design doc); this file will
 * be deleted when the recommender lands.
 *
 * The three mock playbooks below are illustrative — they show what a
 * proposal looks like on screen, not what the real seed set will be. That
 * list is Charan's call after this UX is signed off.
 */

export interface AxisWeights {
  skill: number;
  availability: number;
  experience: number;
}

export interface Knockout {
  label: string;
  rule: string; // human-readable; the DB version is a deterministic expression
}

export interface MockPlaybook {
  industry: string;
  role_family: string;
  tier: 'human_curated' | 'promoted_from_llm' | 'derived';
  source_note: string; // shown in the UI as "why this playbook"
  axis_weights: AxisWeights;
  default_threshold: number;
  knockouts: Knockout[];
  jd_skeleton_title: string;
  comms_tone: string;
}

/**
 * Charan's tenant industry is Technology & SaaS today (from the Smart Profile
 * seed). Three role families under it, one recommended per landing.
 */
export const MOCK_TENANT_INDUSTRY = 'Technology & SaaS';

export const MOCK_ROLE_FAMILIES = [
  'Backend Engineering',
  'Frontend Engineering',
  'Product & Design',
] as const;

export const MOCK_PLAYBOOKS: Record<string, MockPlaybook> = {
  'Backend Engineering': {
    industry: 'Technology & SaaS',
    role_family: 'Backend Engineering',
    tier: 'human_curated',
    source_note: 'Verified with 12 similar tenants',
    axis_weights: { skill: 55, availability: 20, experience: 25 },
    default_threshold: 30,
    knockouts: [
      { label: 'Notice period', rule: '≤ 60 days' },
      { label: 'Comp band', rule: '≤ ₹45 L' },
      { label: 'Experience floor', rule: '≥ 4 years' },
      { label: 'Work authorization', rule: 'India' },
    ],
    jd_skeleton_title: 'Senior Backend Engineer',
    comms_tone: 'Direct, engineering-first — respects candidate time',
  },
  'Frontend Engineering': {
    industry: 'Technology & SaaS',
    role_family: 'Frontend Engineering',
    tier: 'human_curated',
    source_note: 'Verified with 8 similar tenants',
    axis_weights: { skill: 50, availability: 20, experience: 30 },
    default_threshold: 28,
    knockouts: [
      { label: 'Notice period', rule: '≤ 60 days' },
      { label: 'Comp band', rule: '≤ ₹40 L' },
      { label: 'Portfolio', rule: 'required (link or artefact)' },
    ],
    jd_skeleton_title: 'Senior Frontend Engineer',
    comms_tone: 'Direct, engineering-first — respects candidate time',
  },
  'Product & Design': {
    industry: 'Technology & SaaS',
    role_family: 'Product & Design',
    tier: 'human_curated',
    source_note: 'Verified with 6 similar tenants',
    axis_weights: { skill: 40, availability: 20, experience: 40 },
    default_threshold: 32,
    knockouts: [
      { label: 'Notice period', rule: '≤ 60 days' },
      { label: 'Portfolio', rule: 'required' },
      { label: 'Ownership', rule: 'shipped ≥ 2 products end-to-end' },
    ],
    jd_skeleton_title: 'Senior Product Designer',
    comms_tone: 'Warm, portfolio-forward — invites craft conversations',
  },
};

/**
 * Session-scoped "done" flag — this lives in sessionStorage for the UX
 * preview so Charan can navigate the after-onboarding state without any
 * backend write. Cleared on tab close.
 */
export const UX_DONE_KEY = 'vara-onboarding-ux-done';
