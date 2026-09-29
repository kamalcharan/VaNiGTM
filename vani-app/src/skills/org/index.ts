import type { SkillModule } from '@/platform/registry';

const org: SkillModule = {
  id: 'org',
  name: 'Organization',
  routes: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'organization', icon: '▦', status: 'live' },
    // "Knowledge" and "Knowledge Graph" sat here as planned entries until
    // 2026-09-25/26. Both are real now, under smart-profile:
    // /smart-profile/knowledge and /smart-profile/knowledge-graph. The old
    // paths redirect (next.config.ts).
  ],
};
export default org;
