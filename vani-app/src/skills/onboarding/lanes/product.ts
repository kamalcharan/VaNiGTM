'use client';

/**
 * The VaNi product lane — the organisation declared once, for every agent.
 *
 * Step ids must match the server catalog in VaNiGTM's
 * backend/src/onboarding/lanes.ts exactly; they are the storage key, not labels.
 *
 * `vani:domain`, `vani:team` and `vani:llm_provider` are declared in the server
 * catalog but disabled there until the vani_ platform spine is confirmed applied
 * to vani_gtm_db. Their screens land here when they are turned on — the engine,
 * the rail and the gate already handle them.
 */

import type { OnboardingLane } from '../lane';
import { PRODUCT_LANE_ID } from '../lane';
import UserProfileStep, { UserProfileArtefact } from '../steps/UserProfileStep';
import BusinessProfileStep, { BusinessProfileArtefact } from '../steps/BusinessProfileStep';

export const productLane: OnboardingLane = {
  id: PRODUCT_LANE_ID,
  title: 'Set up VaNi',
  scope: 'product',
  intro:
    'Declared once, for the whole organisation. Every agent you activate later inherits it and will not ask again.',
  steps: [
    {
      step_id: 'user_profile',
      title: 'Your profile',
      shortLabel: 'You',
      summary:
        'So VaNi knows who is acting, and how to reach you when an agent needs a person.',
      Screen: UserProfileStep,
      Artefact: UserProfileArtefact,
    },
    {
      step_id: 'business_profile',
      title: 'Your organisation',
      shortLabel: 'Organisation',
      summary:
        'What the organisation is and what it works on. This binds the domain pack every agent inherits.',
      Screen: BusinessProfileStep,
      Artefact: BusinessProfileArtefact,
    },
  ],
};
