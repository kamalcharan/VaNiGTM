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
    { id: 'agents-all', label: 'All Agents', href: '/agents', group: 'agents', icon: '◉', status: 'live', badge: '3' },
    // Charan, 2026-09-22: orchestration is already handled internally, so this
    // entry stays. But `planned` renders "Not built yet" above the summary,
    // and that was false of the FUNCTION — routing, intake and policy are
    // live in AGENT_REGISTRY; it is only the PAGE that does not exist. The
    // copy now says which. Three things carry the VaNi name (this entry, the
    // vani-skill profile agent, and AGENT_REGISTRY) and that collision has
    // already cost one investigation.
    { id: 'agent-vani', label: 'VaNi · Orchestrator', href: '/agents/vani', group: 'agents', icon: '◉', status: 'planned',
      summary: 'The head — intake, resolve, route, policy, close. It already runs: every agent is dispatched through it. '
        + 'What is not built is a page for it; until there is one, Runs & Traces is where its work is visible.' },
    { id: 'agent-vara', label: 'Vara · Talent', href: '/agents/vara', group: 'agents', icon: '▲', status: 'live',
      summary: 'The first agent. Landing and activation are live; install and the working surfaces arrive slice by slice.' },
    { id: 'agent-gtm', label: 'GTM · Growth', href: '/agents/gtm', group: 'agents', icon: '◎', status: 'live',
      summary: 'Build the audience, put them in motion, work the queue. Reads the Smart Profile; never asks twice.' },
    { id: 'agents-market', label: 'Add agent', href: '/agents/market', group: 'agents', icon: '＋', status: 'planned',
      summary: 'Agents are separately priced and activated per tenant. This is where that happens.' },
  ],
};
export default agents;
