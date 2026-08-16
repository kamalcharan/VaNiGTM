import type { SkillModule } from '@/platform/registry';

const settings: SkillModule = {
  id: 'settings',
  name: 'Settings',
  routes: [
    { id: 'settings', label: 'Settings', href: '/settings', group: 'system', icon: '⚙', status: 'planned',
      summary: 'Org profile, domains, users and role families, per-agent grants, model provider. Built in P2 as the VaNi tenant lane.' },
  ],
};
export default settings;
