import type { SkillModule } from '@/platform/registry';

const runs: SkillModule = {
  id: 'runs',
  name: 'Runs & Traces',
  routes: [
    { id: 'runs', label: 'Runs & Traces', href: '/runs', group: 'system', icon: '⟳', status: 'live', badge: '5' },
  ],
};
export default runs;
