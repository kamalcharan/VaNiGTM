import type { SkillModule } from '@/platform/registry';

/**
 * VaNi is the head — the orchestrator. Agents sit beneath it, each with its own
 * goals, role catalog and metering. Vara is the first; others are built later,
 * and arrive through "Add agent" rather than by editing this file's group.
 */
const agents: SkillModule = {
  id: 'agents',
  name: 'Agents',
  routes: [
    { id: 'agents-all', label: 'All Agents', href: '/agents', group: 'agents', icon: '◉', status: 'live', badge: '2' },
    { id: 'agent-vani', label: 'VaNi · Orchestrator', href: '/agents/vani', group: 'agents', icon: '◉', status: 'planned',
      summary: 'The head. Intake, resolve, route, policy, close — it owns no domain reasoning of its own.' },
    { id: 'agent-vara', label: 'Vara · Talent', href: '/agents/vara', group: 'agents', icon: '▲', status: 'planned',
      summary: 'The first agent. Its screens and activation lane arrive in P3, against the integration contract.' },
    { id: 'agents-market', label: 'Add agent', href: '/agents/market', group: 'agents', icon: '＋', status: 'planned',
      summary: 'Agents are separately priced and activated per tenant. This is where that happens.' },
  ],
};
export default agents;
