import type { SkillModule } from '@/platform/registry';

const org: SkillModule = {
  id: 'org',
  name: 'Organization',
  routes: [
    { id: 'dashboard', label: 'Dashboard', href: '/dashboard', group: 'organization', icon: '▦', status: 'live' },
    { id: 'profile', label: 'Smart Profile', href: '/profile', group: 'organization', icon: '◈', status: 'planned',
      summary: 'The organisation as VaNi understands it — what it sells, to whom, and the facts every agent inherits.' },
    { id: 'knowledge', label: 'Knowledge', href: '/knowledge', group: 'organization', icon: '▤', status: 'planned',
      summary: 'Documents and facts the org has taught VaNi, with provenance for each one.' },
    { id: 'kg', label: 'Knowledge Graph', href: '/kg', group: 'organization', icon: '⁂', status: 'planned',
      summary: 'Entities and relationships across the org. Deferred by the platform spec until knowledge matures.' },
  ],
};
export default org;
