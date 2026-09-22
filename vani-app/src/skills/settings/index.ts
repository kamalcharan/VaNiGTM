import type { SkillModule } from '@/platform/registry';

const settings: SkillModule = {
  id: 'settings',
  name: 'Settings',
  routes: [
    // Appearance is live now; the rest of Settings is still P2. Shipping it as
    // its own route rather than waiting for the settings page it will
    // eventually be a tab of — a theme picker nobody can reach is not a theme
    // picker.
    { id: 'appearance', label: 'Appearance', href: '/appearance', group: 'system', icon: '◐', status: 'live',
      summary: 'Theme and colour mode, stored against your account.' },
    { id: 'settings', label: 'Settings', href: '/settings', group: 'system', icon: '⚙', status: 'planned',
      summary: 'Org profile, domains, users and role families, per-agent grants, model provider. Built in P2 as the VaNi tenant lane.' },
  ],
};
export default settings;
