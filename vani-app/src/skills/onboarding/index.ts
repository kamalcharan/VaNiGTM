/**
 * The onboarding agent.
 *
 * It ships the engine (screens/OnboardingRunner) and the product lane
 * (lanes/product). It ships no agent's lane — those come with their agents, via
 * `registerLane()` in lanes/index.ts, so activating Vara later touches neither
 * the engine nor platform/.
 *
 * ONE nav entry, and only because the wizard is also the Smart Profile's only
 * view. VaNiGTM does the same: there is no separate "here is what VaNi knows"
 * screen — `brain/knowledge` is still a ComingSoon stub — because revisiting
 * the wizard already shows it. It restores the whole mission on load (profile,
 * vocabulary, competitors, brand, and the research run's steps) and renders it
 * as the accumulated left rail.
 *
 * Without the entry the profile was unreachable: the wizard finishes by
 * replacing the route with /dashboard, and nothing linked back — so a tenant who
 * had just built a Smart Profile had no way to look at it.
 *
 * The route still lives OUTSIDE the console shell, which is what stops a gated
 * tenant clicking past onboarding into the app. The nav entry only points at it.
 */

import type { SkillModule } from '@/platform/registry';

const onboarding: SkillModule = {
  id: 'onboarding',
  name: 'Onboarding',
  routes: [
    {
      id: 'mission',
      label: 'Mission',
      href: '/onboarding',
      group: 'organization',
      icon: '◈',
      status: 'live',
      summary:
        'What VaNi knows about your business — product, market vocabulary, competitors, ideal customer and brand. Revisit any step to change it.',
    },
  ],
};

export default onboarding;
