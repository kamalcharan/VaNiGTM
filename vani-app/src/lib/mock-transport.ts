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

const ONBOARDING_CATALOG = [
  { step_id: 'user_profile', title: 'Your profile', summary: 'Your name and how VaNi should reach you.', story: 'VN-11' },
  { step_id: 'business_profile', title: 'Your organisation', summary: 'What the organisation is and which industry it works in.', story: 'VN-10' },
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
  state: 'no_industry' | 'ready' | 'running' | 'in_review' | 'failed' | 'none';
  industry: string | null;
  domain: string | null;
  families: number;
  can_request: boolean;
  detail: string;
}

let MOCK_RESEARCH: MockResearch = {
  state: 'none',
  industry: 'Logistics & Freight',
  domain: 'logistics-freight',
  families: 0,
  can_request: true,
  detail: 'Vara has not studied Logistics & Freight yet.',
};

const HANDLERS: Record<string, () => unknown> = {
  'agents.list': () => ({ agents: AGENTS }),
  'dashboard.activity': () => ({ activity: ACTIVITY }),
  'dashboard.counters': () => ({
    agents_active: AGENTS.filter((a) => a.status === 'active').length,
    runs_today: RUNS.length,
    attention: RUNS.filter((r) => r.status === 'failed').length,
    handovers: 1,
  }),
  'runs.list': () => ({ runs: RUNS }),
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
};

/** Writes need the params, so they are handled separately from the read table. */
const WRITE_HANDLERS: Record<string, (p: Record<string, unknown>) => unknown> = {
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

  'domain-pack-skill.request_research': () => {
    // Mirrors the real function: queueing flips the card to 'running' and the
    // screen polls. It does NOT jump to 'ready' — research takes a minute, and
    // a mock that succeeds instantly hides every loading state built for it.
    MOCK_RESEARCH = {
      state: 'running',
      industry: MOCK_RESEARCH.industry,
      domain: MOCK_RESEARCH.domain,
      families: 0,
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
    else if (read) result = { success: true, skill, function: fn, data: read() };
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
