/**
 * Mock skill transport for P0.
 *
 * Every screen in the first delivery is fed from here so the UX layer can be
 * built and reviewed before auth and the VPS wiring exist. Replacing this with
 * the live transport is a one-line change in the provider — if a screen has to
 * change when that happens, the seam leaked and the screen is at fault.
 *
 * Shapes here are the contract the backend must satisfy. Keep them honest.
 */

import type { SkillResult, SkillTransport } from './useSkill';
import { GTM_MOCK_READS, GTM_MOCK_WRITES } from '@/skills/gtm-shell/mock';
import { EDGE_MOCK_READS } from '@/skills/edge/mock';
import { OFFERS_MOCK_READS, OFFERS_MOCK_WRITES } from '@/skills/smart-profile/offers-mock';
import { KNOWLEDGE_MOCK_READS, KNOWLEDGE_MOCK_WRITES } from '@/skills/smart-profile/knowledge-mock';

export interface AgentSummary {
  id: string;
  name: string;
  role: string;
  color: string;
  icon: string;
  scope: string;
  status: 'active' | 'attention' | 'not_activated';
  runs: number;
  tools: number;
  facts: number | null;
  desc: string;
}

export interface ActivityItem {
  id: string;
  at: string;
  agent: string;
  text: string;
  run: string | null;
}

export interface RunRow {
  id: string;
  agent: string;
  trigger: string;
  started: string;
  duration: string;
  steps: number;
  status: 'ok' | 'running' | 'failed';
  actor: 'human' | 'rule' | 'timer' | 'system';
}

/**
 * VaNi is the head — the orchestrator. Agents sit beneath it with their own
 * goals, role catalogs and metering. Vara is the first; the rest follow.
 */
const AGENTS: AgentSummary[] = [
  {
    id: 'vani',
    name: 'VaNi',
    role: 'Orchestrator',
    color: '#C9973A',
    icon: '◉',
    scope: 'org://vikuna/**',
    status: 'active',
    runs: 184,
    tools: 4,
    facts: null,
    desc: 'The head. Intake, resolve, route, policy, close. Owns no domain reasoning of its own.',
  },
  {
    id: 'vara',
    name: 'Vara',
    role: 'Talent Agent',
    color: '#FF8A3D',
    icon: '▲',
    scope: 'org://vikuna/talent/**',
    status: 'not_activated',
    runs: 0,
    tools: 0,
    facts: null,
    desc: 'Rules reject, models rank, humans decide. Scores candidates against a role family and hands over at the decision boundary.',
  },
  {
    id: 'gtm',
    name: 'GTM',
    role: 'Growth Agent',
    color: '#4FA3E0',
    icon: '◎',
    scope: 'org://vikuna/gtm/**',
    status: 'active',
    runs: 12,
    tools: 6,
    facts: null,
    desc: 'Builds the audience from global data and your own, qualifies with evidence, and puts people in motion under the cadence governor.',
  },
];

const ACTIVITY: ActivityItem[] = [
  { id: 'a1', at: '2m', agent: 'vani', text: 'Routed <b>sla.timer.breached</b> on contract CN-2847 to the ops handler', run: 'run_8f3a91' },
  { id: 'a2', at: '14m', agent: 'vani', text: 'Policy check passed for <b>invoice.hold</b> — evidence missing on visit 10 of 12', run: 'run_8f3a44' },
  { id: 'a3', at: '1h', agent: 'vani', text: 'Escalated to <b>facility manager</b> — decision boundary reached', run: 'run_8f3a02' },
  { id: 'a4', at: '3h', agent: 'vani', text: 'Domain pack <b>facilities v4</b> bound to this tenant', run: null },
];

const RUNS: RunRow[] = [
  { id: 'run_8f3a91', agent: 'VaNi', trigger: 'sla.timer.breached', started: '09:14:02', duration: '4.1s', steps: 6, status: 'ok', actor: 'timer' },
  { id: 'run_8f3a44', agent: 'VaNi', trigger: 'invoice.evidence.missing', started: '09:01:37', duration: '2.7s', steps: 4, status: 'ok', actor: 'rule' },
  { id: 'run_8f3a02', agent: 'VaNi', trigger: 'handover.requested', started: '08:22:10', duration: '1.2s', steps: 3, status: 'ok', actor: 'human' },
  { id: 'run_8f39c8', agent: 'VaNi', trigger: 'pack.upgrade.offered', started: '07:55:41', duration: '—', steps: 2, status: 'running', actor: 'system' },
  { id: 'run_8f3982', agent: 'VaNi', trigger: 'comms.send', started: '07:12:03', duration: '0.9s', steps: 2, status: 'failed', actor: 'system' },
];

/**
 * Onboarding progress, held in memory so the wizard can actually be walked
 * end to end against the mock. Resets on reload, which is what you want when
 * testing the flow repeatedly.
 */
const ONBOARDING_DONE = new Set<string>();

/**
 * Must mirror the ENABLED steps of the server's `vani` lane
 * (VaNiGTM `backend/src/onboarding/lanes.ts`) and the client catalog in
 * `src/skills/onboarding/lanes/product.ts`. Three catalogs, and nothing keeps
 * them in sync.
 *
 * `vani:domain` was missing here while being enabled in both of the others, so
 * mock mode — the mode that exists for looking at screens without a backend —
 * could not reach the domain step at all. That went unnoticed because a
 * catalog that stops early looks exactly like onboarding being finished.
 */
const ONBOARDING_CATALOG = [
  { step_id: 'user_profile', title: 'Your profile', summary: 'Your name and how VaNi should reach you.', story: 'VN-11' },
  { step_id: 'business_profile', title: 'Your organisation', summary: 'What the organisation is and which industry it works in.', story: 'VN-10' },
  { step_id: 'vani:domain', title: 'Your domain', summary: 'Where your workspace lives, and where Vara\'s widget may load.', story: 'VN-10' },
];

function onboardingStatus() {
  const steps = ONBOARDING_CATALOG.map((s) => ({
    ...s,
    status: ONBOARDING_DONE.has(s.step_id) ? 'completed' : 'pending',
    completed_at: null,
  }));
  const next = steps.find((s) => s.status !== 'completed');
  return {
    lane: { id: 'vani', title: 'Set up VaNi', scope: 'product' },
    complete: !next,
    steps,
    next_incomplete_step: next ? next.step_id : null,
  };
}

/**
 * BYOK mock state.
 *
 * Mirrors the server's two postures so the screen can be worked on without a
 * backend: null provider = platform, a row = byok. The key is never echoed
 * back here either — the mock returns a HINT, because a mock that hands the
 * secret back would let a screen be written against a response the real API
 * will never send.
 */
let MOCK_PROVIDER: {
  providerCode: string; model: string | null; baseUrl: string | null;
  testStatus: 'untested' | 'passed' | 'failed'; lastTestAt: string | null;
  keyHint: string | null;
} | null = null;

const MOCK_CATALOGUE = [
  { code: 'openai',    label: 'OpenAI',      defaultModel: 'gpt-4o-mini',            keyRequired: true,  needsBaseUrl: false },
  { code: 'anthropic', label: 'Anthropic',   defaultModel: 'claude-haiku-4-5',       keyRequired: true,  needsBaseUrl: false },
  { code: 'groq',      label: 'Groq',        defaultModel: 'llama-3.3-70b-versatile', keyRequired: true,  needsBaseUrl: false },
  { code: 'custom',    label: 'Self-hosted', defaultModel: '',                        keyRequired: false, needsBaseUrl: true  },
];

interface MockResearch {
  state: 'no_industry' | 'ready' | 'seeded_only'
       | 'running' | 'in_review' | 'failed' | 'none';
  industry: string | null;
  domain: string | null;
  families: number;
  source: 'seeded' | 'researched' | 'mixed';
  researched_at: string | null;
  can_request: boolean;
  detail: string;
}

let MOCK_RESEARCH: MockResearch = {
  // Defaults to the state a real tenant on Technology & SaaS is actually in:
  // migration 244 seeded three handcrafted packs in August, so the family list
  // is FULL and nothing has been researched. That is the case an empty-state
  // check can never catch, which is why it is the default here.
  state: 'seeded_only',
  industry: 'Technology & SaaS',
  domain: 'technology-saas',
  families: 3,
  source: 'seeded',
  researched_at: null,
  can_request: true,
  detail: "The 3 families shown are Vikuna's generic starter set, not researched for Technology & SaaS.",
};

const MOCK_TENANT_INDUSTRY = 'Technology & SaaS';

/** The catalogue the take step reads. Two families is enough to exercise
 *  picked / not-picked / already-mine without turning the mock into a fixture
 *  nobody maintains. */
const MOCK_CATALOGUE_FAMILIES = [
  {
    pack_code: 'talent-technology-saas-software-development', pack_version: 1,
    name: 'Software Development',
    hint: 'Core development roles for building and maintaining software',
    suggested_titles: ['Senior Software Engineer', 'Full Stack Developer', 'Software Developer'],
    starter: {
      role_summary_hint: 'Ships and owns backend services end to end',
      musthaves: [
        { name: 'Production service ownership', weight: 40, years: 3,
          why: 'The signal that separates someone who has run a service from someone who has written one' },
        { name: 'Relational data modelling', weight: 30 },
        { name: 'Cloud deployment', weight: 20 },
        { name: 'Testing rigour', weight: 10 },
      ],
      knockouts: [] as { label: string; rule: string }[],
      threshold: 30,
    },
    provenance: { researched: true, review_state: 'unreviewed', requested_by: null, at: '2026-09-17T06:41:18Z' },
  },
  {
    pack_code: 'talent-technology-saas-backend-eng', pack_version: 1,
    name: 'Backend Engineering',
    hint: "Vikuna's hand-written starter — never researched for anyone",
    suggested_titles: ['Senior Backend Engineer', 'Backend Tech Lead'],
    starter: {
      role_summary_hint: 'Ships production services end to end',
      musthaves: [
        { name: 'TypeScript / Node.js in production', weight: 60 },
        { name: 'PostgreSQL — row-level security, migrations', weight: 40 },
      ],
      knockouts: [] as { label: string; rule: string }[],
      threshold: 30,
    },
    provenance: { researched: false, review_state: null, requested_by: null, at: null },
  },
];
/**
 * The one fixture family `match_title` can match in mock mode — and it IS the
 * catalogue row, not a second copy of it. It was a separate literal, and the
 * two drifted: the JD opened on four must-haves before the family was taken
 * and two after, so taking a family looked like it LOST half its shape. That
 * is the opposite of what the take step promises, and it was a fixture bug
 * reading as a product bug.
 */
const MOCK_MATCH_FAMILY =
  MOCK_CATALOGUE_FAMILIES.find((f) => f.name === 'Backend Engineering')!;

/** Families this mock tenant has taken. Mutated by take_families, exactly as
 *  the real write is: idempotent, so a repeat lands under `already`. */
const MOCK_MINE = new Set<string>();
/** A taken family's LIVE shape, which diverges from the pack once edited. */
const MOCK_MINE_SHAPE = new Map<string, { musthaves: unknown[]; knockouts: unknown[]; threshold: number; version: number }>();

/**
 * Reads. They take the params as well — `match_title` is a read whose whole
 * answer depends on what was typed, and splitting it into WRITE_HANDLERS just
 * to reach the params would have lied about what it does. Handlers that do not
 * need them ignore the argument.
 */
/**
 * Console P0 reads that never got a backend: the dashboard's counters and
 * activity, the agents list, the runs list. On the live transport they are
 * answered from here through lib/preview.ts — labelled — until the API grows
 * them. Exported so the preview list can name them without a second copy.
 */
export const CONSOLE_PREVIEW_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'agents.list': () => ({ agents: AGENTS }),
  'dashboard.activity': () => ({ activity: ACTIVITY }),
  'dashboard.counters': () => ({
    agents_active: AGENTS.filter((a) => a.status === 'active').length,
    runs_today: RUNS.length,
    attention: RUNS.filter((r) => r.status === 'failed').length,
    handovers: 1,
  }),
  'runs.list': () => ({ runs: RUNS }),
};

const HANDLERS: Record<string, (p: Record<string, unknown>) => unknown> = {
  ...GTM_MOCK_READS,
  ...OFFERS_MOCK_READS,
  ...KNOWLEDGE_MOCK_READS,
  ...CONSOLE_PREVIEW_READS,
  ...EDGE_MOCK_READS,
  'onboarding.status': () => onboardingStatus(),
  'llm-provider-skill.get_provider': () => ({
    provider: MOCK_PROVIDER,
    posture: MOCK_PROVIDER ? 'byok' : 'platform',
  }),
  'llm-provider-skill.get_catalogue': () => ({
    providers: MOCK_CATALOGUE,
    // True in the mock: the point of mock mode is working on the screen, not
    // rehearsing an operator's missing env var. The blocked state is reachable
    // by flipping this.
    encryptionReady: true,
  }),

  // Domain packs. Defaults to 'none' — the state a tenant in an unresearched
  // industry actually sees, and the one the Research button exists for. The
  // other four are reachable by editing MOCK_RESEARCH below; 'failed' is worth
  // looking at, since it is the only one that renders an upstream error.
  'domain-pack-skill.research_status': () => MOCK_RESEARCH,

  // Title → role family. The REAL matcher is deterministic and lives on the
  // server (domain-pack-skill/title-match.ts, scored against every published
  // pack). This is not a copy of it and must not become one — it exists so
  // both branches of JD Studio are reachable in mock mode: a title mentioning
  // backend/server/api matches one fixture family, everything else returns
  // matched:false, which is the state that proves the composer still works
  // with nothing suggested.
  'domain-pack-skill.catalogue': () => {
    const families = MOCK_CATALOGUE_FAMILIES.map((f) => ({ ...f, mine: MOCK_MINE.has(f.name) }));
    return {
      industry: MOCK_TENANT_INDUSTRY, domain: 'technology-saas', families,
      mine: families.filter((f) => f.mine).length,
      detail: `${families.length} role families known for ${MOCK_TENANT_INDUSTRY}.`,
    };
  },

  'domain-pack-skill.my_families': () => {
    const families = MOCK_CATALOGUE_FAMILIES.filter((f) => MOCK_MINE.has(f.name)).map((f) => {
      const live = MOCK_MINE_SHAPE.get(f.name);
      return {
        family_id: `mock-${f.pack_code}`, name: f.name, hint: f.hint,
        version: live?.version ?? 1,
        musthaves: live?.musthaves ?? f.starter.musthaves ?? [],
        knockouts: live?.knockouts ?? f.starter.knockouts ?? [],
        role_summary_hint: f.starter.role_summary_hint ?? null, band_hint: null,
        threshold: live?.threshold ?? f.starter.threshold ?? 30, axis_weights: null,
        from_pack: { code: f.pack_code, version: f.pack_version },
        suggested_titles: f.suggested_titles,
        edited: (live?.version ?? 1) > 1,
      };
    });
    return {
      families,
      detail: families.length
        ? `${families.length} famil${families.length === 1 ? 'y' : 'ies'} in your workspace.`
        : 'You have not taken any role families yet. Take one from your industry, or shape a role from scratch.',
    };
  },

  'domain-pack-skill.match_title': (p) => {
    const title = String(p.title ?? '').trim();
    if (title.length < 2) {
      return { matched: false, reason: 'NO_TITLE', detail: 'Type a role title first.' };
    }
    const hit = /\b(backend|server|api|platform)\b/i.test(title);
    if (!hit) {
      return {
        matched: false,
        reason: 'NO_FAMILY_MATCH',
        industry: MOCK_TENANT_INDUSTRY,
        detail: `No role family in ${MOCK_TENANT_INDUSTRY} looks like "${title}". `
          + 'Vara will ask about it from scratch.',
      };
    }
    // The compounding, mocked: once this family has been taken (and possibly
    // edited) in the take step, the match opens on the tenant's OWN shape and
    // says so. Without this branch the second-JD path — the whole reason the
    // matcher looks at `my_families` before the catalogue — is invisible in
    // mock mode, which is where the screen actually gets worked on.
    const owned = MOCK_MINE.has(MOCK_MATCH_FAMILY.name);
    const live = MOCK_MINE_SHAPE.get(MOCK_MATCH_FAMILY.name);
    const starter = owned && live
      ? { ...MOCK_MATCH_FAMILY.starter, musthaves: live.musthaves, knockouts: live.knockouts, threshold: live.threshold }
      : MOCK_MATCH_FAMILY.starter;
    const version = live?.version ?? 1;
    return {
      matched: true,
      title,
      family_name: MOCK_MATCH_FAMILY.name,
      matched_title: MOCK_MATCH_FAMILY.suggested_titles[0],
      score: 82,
      researched: false,
      pack_code: 'mock-backend-engineering',
      pack_version: 1,
      starter,
      mine: owned,
      family_id: owned ? 'mock-talent-technology-saas-backend-eng' : null,
      version: owned ? version : null,
      alternates: [],
      detail: owned
        ? `${MOCK_MATCH_FAMILY.name} is already yours — opening on your v${version}.`
        : `Matched "${MOCK_MATCH_FAMILY.suggested_titles[0]}" in `
          + `${MOCK_MATCH_FAMILY.name} — a Vikuna starter shape, `
          + `not researched for ${MOCK_TENANT_INDUSTRY}.`,
    };
  },
};

/** Writes need the params, so they are handled separately from the read table. */
const WRITE_HANDLERS: Record<string, (p: Record<string, unknown>) => unknown> = {
  ...GTM_MOCK_WRITES,
  ...OFFERS_MOCK_WRITES,
  ...KNOWLEDGE_MOCK_WRITES,
  'onboarding.complete_step': (p) => {
    const stepId = String(p.step_id ?? '');
    if (!ONBOARDING_CATALOG.some((s) => s.step_id === stepId)) {
      throw new Error(`Step "${stepId}" is not a step of this lane`);
    }
    // Idempotent by construction, exactly like the server: a Set, so replaying
    // the same completion cannot produce a second anything.
    ONBOARDING_DONE.add(stepId);
    const next = ONBOARDING_CATALOG.find((s) => !ONBOARDING_DONE.has(s.step_id));
    return {
      step: { step_id: stepId, status: 'completed' },
      lane: 'vani',
      next_step: next ? next.step_id : null,
      onboarding_complete: !next,
    };
  },

  'llm-provider-skill.save_provider': (p) => {
    const code = String(p.provider_code ?? '');
    const entry = MOCK_CATALOGUE.find((c) => c.code === code);
    if (!entry) throw new Error(`'${code}' is not a provider we know.`);

    const key = typeof p.key === 'string' ? p.key : '';
    if (entry.keyRequired && !key && !MOCK_PROVIDER?.keyHint) {
      throw new Error(`${entry.label} needs an API key.`);
    }
    if (entry.needsBaseUrl && !p.base_url) {
      throw new Error('A self-hosted provider must give the endpoint URL.');
    }

    // Idempotent by construction, like the server: assignment to one slot, so
    // replaying the same attempt cannot produce a second provider.
    MOCK_PROVIDER = {
      providerCode: code,
      model: (typeof p.model === 'string' && p.model) || entry.defaultModel || null,
      baseUrl: (typeof p.base_url === 'string' && p.base_url) || null,
      testStatus: 'untested',
      lastTestAt: null,
      // Hint only — never the key, exactly as the real API behaves.
      keyHint: key ? `${key.slice(0, 4)}…${key.slice(-4)}` : (MOCK_PROVIDER?.keyHint ?? null),
    };
    return { provider: MOCK_PROVIDER, posture: 'byok' };
  },

  'domain-pack-skill.take_families': (p) => {
    const codes = Array.isArray(p.codes) ? p.codes.map(String) : [];
    if (!codes.length) return { taken: [], already: [], reason: 'NO_CODES', detail: 'Pick at least one family.' };
    const unknown = codes.filter((c) => !MOCK_CATALOGUE_FAMILIES.some((f) => f.pack_code === c));
    if (unknown.length) {
      // Whole batch, like the server: taking three of four and reporting
      // success is how a tenant ends up missing a family they believe in.
      throw new Error(`Not a role family in ${MOCK_TENANT_INDUSTRY}: ${unknown.join(', ')}`);
    }
    const taken: { code: string; name: string }[] = [];
    const already: { code: string; name: string }[] = [];
    for (const c of codes) {
      const f = MOCK_CATALOGUE_FAMILIES.find((x) => x.pack_code === c)!;
      (MOCK_MINE.has(f.name) ? already : taken).push({ code: c, name: f.name });
      MOCK_MINE.add(f.name);
    }
    return {
      taken, already,
      detail: taken.length
        ? `${taken.length} famil${taken.length === 1 ? 'y is' : 'ies are'} now yours.`
        : 'You already had all of those.',
    };
  },

  'domain-pack-skill.update_family_shape': (p) => {
    const familyId = String(p.family_id ?? '');
    const f = MOCK_CATALOGUE_FAMILIES.find((x) => `mock-${x.pack_code}` === familyId);
    if (!f || !MOCK_MINE.has(f.name)) throw new Error('That is not a family in your workspace.');
    const musthaves = Array.isArray(p.musthaves) ? p.musthaves : [];
    // Same floor as the server: a family that scores nothing gives every
    // candidate the same number, which reads as a judgement.
    if (!musthaves.length) {
      throw new Error('A family needs at least one must-have — Vara has nothing to score without one.');
    }
    const prev = MOCK_MINE_SHAPE.get(f.name);
    const version = (prev?.version ?? 1) + 1;
    MOCK_MINE_SHAPE.set(f.name, {
      musthaves,
      knockouts: Array.isArray(p.knockouts) ? p.knockouts : [],
      threshold: typeof p.threshold === 'number' ? p.threshold : 30,
      version,
    });
    return {
      ok: true, family_id: familyId, name: f.name, version,
      detail: `${f.name} is now v${version}. Earlier versions stay readable.`,
    };
  },

  'domain-pack-skill.request_research': () => {
    // Mirrors the real function: queueing flips the card to 'running' and the
    // screen polls. It does NOT jump to 'ready' — research takes a minute, and
    // a mock that succeeds instantly hides every loading state built for it.
    MOCK_RESEARCH = {
      ...MOCK_RESEARCH,
      state: 'running',
      can_request: false,
      detail: `Vara is learning how ${MOCK_RESEARCH.industry} hires. This usually takes a minute.`,
    };
    return {
      queued: true,
      industry: MOCK_RESEARCH.industry,
      domain: MOCK_RESEARCH.domain,
      event_id: 'mock-event',
      detail: MOCK_RESEARCH.detail,
    };
  },

  'llm-provider-skill.test_provider': () => {
    if (!MOCK_PROVIDER) throw new Error('No model provider is configured.');
    MOCK_PROVIDER = { ...MOCK_PROVIDER, testStatus: 'passed', lastTestAt: new Date().toISOString() };
    return { ok: true, detail: 'Answered in 210ms: "ok"', model: MOCK_PROVIDER.model ?? '', latencyMs: 210 };
  },

  'llm-provider-skill.remove_provider': () => {
    MOCK_PROVIDER = null;
    return { provider: null, posture: 'platform' };
  },
};

/** Small delay so loading states are exercised rather than skipped. */
export const mockTransport: SkillTransport = async (skill, fn, params) => {
  await new Promise((r) => setTimeout(r, 220));
  const key = `${skill}.${fn}`;
  const write = WRITE_HANDLERS[key];
  const read = HANDLERS[key];

  let result: SkillResult;
  try {
    if (write) result = { success: true, skill, function: fn, data: write(params) };
    else if (read) result = { success: true, skill, function: fn, data: read(params) };
    else result = { success: false, skill, function: fn, data: null, error: `No mock for ${key}` };
  } catch (err) {
    result = {
      success: false,
      skill,
      function: fn,
      data: null,
      error: err instanceof Error ? err.message : 'Mock failed',
    };
  }
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mock-transport]', skill, fn, params, result.success ? 'ok' : result.error);
  }
  return result;
};
