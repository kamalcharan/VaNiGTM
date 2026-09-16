/**
 * Install — the platform's embed channel, not any agent's.
 *
 * One tenant pastes one tag; every live agent is reachable through it. That is
 * why this is a `system` route beside Settings rather than a page under
 * /agents/vara: the snippet, the origin allowlist and the site-alive signal
 * belong to the workspace, and an agent's readiness is the agent's own screen.
 */
import type { SkillModule } from '@/platform/registry';

const install: SkillModule = {
  id: 'install',
  name: 'Install',
  routes: [
    { id: 'install', label: 'Install', href: '/install', group: 'system', icon: '⧉', status: 'live',
      summary: 'The snippet for your site, the origins allowed to run it, and which of them have actually booted.' },
  ],
};
export default install;
