import type { SkillModule } from '@/platform/registry';

/**
 * BYOK. `id` matches the backend skill name so the generic transport reaches
 * it without an entry in live-transport's PLATFORM_ROUTES — that table is the
 * countable list of exceptions and is meant to stay small, which is why the
 * backend side was built as a skill rather than as REST routes to wire up here.
 */
const modelProvider: SkillModule = {
  id: 'llm-provider-skill',
  name: 'Model Provider',
  routes: [
    {
      id: 'model-provider',
      label: 'Model Provider',
      href: '/model-provider',
      group: 'system',
      icon: '⚿',
      status: 'live',
      summary: 'The endpoint, model and key every agent in this workspace uses.',
    },
  ],
};
export default modelProvider;
