import type { SkillModule } from '@/platform/registry';

const org: SkillModule = {
  id: 'org',
  name: 'Organization',
  routes: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'organization', icon: '▦', status: 'live' },
    // "Knowledge" and "Knowledge Graph" sat here as planned entries until
    // 2026-09-25. Knowledge is now real — smart-profile's /smart-profile/
    // knowledge (sources + what VaNi learned, by kind). A graph explorer is
    // still not being built; the old paths redirect (next.config.ts).
  ],
};
export default org;
