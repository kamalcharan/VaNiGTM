/**
 * Console cosmetics for agents — colour, icon, role line, one-line purpose,
 * scope. The API's `agents.list` answers identity and state (vani_agent ⋈
 * vani_tenant_agent); how an agent LOOKS is the console's decision and lives
 * here, keyed by agent code, so a row the API adds tomorrow renders with a
 * sane fallback rather than an empty swatch.
 */
export interface AgentMeta {
  role: string;
  color: string;
  icon: string;
  desc: string;
  scope: string;
}

export const AGENT_META: Record<string, AgentMeta> = {
  vani: { role: 'Orchestrator', color: '#C9973A', icon: '◉', scope: 'org://**',
    desc: 'The head. Intake, resolve, route, policy, close. Owns no domain reasoning of its own.' },
  vara: { role: 'Talent Agent', color: '#FF8A3D', icon: '▲', scope: 'org://talent/**',
    desc: 'Screens applicants against a JD the tenant shaped; humans decide, Vara prepares the decision.' },
  gtm:  { role: 'Go-to-market', color: '#3DA5FF', icon: '◈', scope: 'org://gtm/**',
    desc: 'Reads the Smart Profile, proposes an audience, finds the people, and runs the journey.' },
  edge: { role: 'Automation readiness', color: '#2E9E6B', icon: '◌', scope: 'org://edge/**',
    desc: 'Before you automate, know where you stand — a guided readiness and strategy mission.' },
  nova: { role: 'Digital marketing', color: '#B072FF', icon: '✦', scope: 'org://nova/**',
    desc: 'Fix the digital estate and run a campaign. Not built.' },
};

const FALLBACK: AgentMeta = { role: 'Agent', color: '#8A8A8A', icon: '●', scope: 'org://**', desc: '' };

export function metaFor(id: string): AgentMeta {
  return AGENT_META[id] ?? FALLBACK;
}
