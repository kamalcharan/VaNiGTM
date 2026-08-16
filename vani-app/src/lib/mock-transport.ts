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
    color: '#2DD4BF',
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
    color: '#F59E0B',
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
};

/** Small delay so loading states are exercised rather than skipped. */
export const mockTransport: SkillTransport = async (skill, fn, params) => {
  await new Promise((r) => setTimeout(r, 220));
  const handler = HANDLERS[`${skill}.${fn}`];
  const result: SkillResult = handler
    ? { success: true, skill, function: fn, data: handler() }
    : { success: false, skill, function: fn, data: null, error: `No mock for ${skill}.${fn}` };
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[mock-transport]', skill, fn, params, result.success ? 'ok' : result.error);
  }
  return result;
};
