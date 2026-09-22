import type { SkillModule } from '@/platform/registry';

/**
 * Settings is ONE place (Charan, 2026-09-22: "models, appearance, BYO — be
 * inside settings"). Appearance and Model Provider used to be two top-level
 * SYSTEM entries beside a planned /settings; they are tabs here now, and the
 * old routes redirect (next.config.ts).
 *
 * The tabs are declared in ./tabs.ts, not here: the nav shows one entry, the
 * frame shows the tabs, and a new tab is a line in tabs.ts plus a page file.
 */
const settings: SkillModule = {
  id: 'settings',
  name: 'Settings',
  routes: [
    { id: 'settings', label: 'Settings', href: '/settings', group: 'system', icon: '⚙', status: 'live',
      summary: 'Appearance, model provider, your own data provider, channels — everything that is yours to configure.' },
  ],
};
export default settings;
