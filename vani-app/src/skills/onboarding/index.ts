/**
 * The onboarding agent.
 *
 * It ships the engine (screens/OnboardingRunner) and the product lane
 * (lanes/product). It ships no agent's lane — those come with their agents, via
 * `registerLane()` in lanes/index.ts, so activating Vara later touches neither
 * the engine nor platform/.
 *
 * No nav entry. Onboarding is not a place you visit; it is a thing required of
 * you, and the gate decides when. Its route lives outside the console shell so
 * a gated tenant cannot click past it into the app.
 *
 * The destination in the nav is `smart-profile` — the record. This is the build
 * flow, reached from there when a section needs changing (`/onboarding?step=…`).
 */

import type { SkillModule } from '@/platform/registry';

const onboarding: SkillModule = {
  id: 'onboarding',
  name: 'Onboarding',
  routes: [],
};

export default onboarding;
