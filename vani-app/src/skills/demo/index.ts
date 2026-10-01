import type { SkillModule } from '@/platform/registry';

/**
 * Exit-criterion proof for P0. Exists only to demonstrate that a skill can be
 * added as one folder plus one line in ../index.ts with no diff inside
 * src/platform/. Delete it once a real skill has taken its place.
 */
const demo: SkillModule = {
  id: 'demo',
  name: 'Demo Skill',
  routes: [
    { id: 'demo', label: 'Demo Skill', href: '/demo', group: 'system', icon: '◇', status: 'planned',
      summary: 'Proof that the registry works: this row exists because of one entry in src/skills/index.ts, and nothing in src/platform/ knows about it.' },
  ],
};
export default demo;
