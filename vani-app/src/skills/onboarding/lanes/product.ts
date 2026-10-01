'use client';

/**
 * The VaNi product lane — the organisation declared once, for every agent.
 *
 * Step ids must match the server catalog in VaNiGTM's
 * backend/src/onboarding/lanes.ts exactly; they are the storage key, not labels.
 *
 * `vani:domain` is live — the spine was applied 2026-08-17 (VaNiGTM migration
 * 240) and its writer bridges the vn_ tenant to `vani_tenant` by slug.
 * `vani:team` and `vani:llm_provider` remain disabled in the server catalog:
 * People is already served by the vn_ spine (/auth/team, /auth/invite), and
 * BYOK has no encryption path yet. Their screens land here when they turn on.
 */

import type { OnboardingLane } from '../lane';
import { PRODUCT_LANE_ID } from '../lane';
import UserProfileStep, { UserProfileArtefact } from '../steps/UserProfileStep';
import BusinessProfileStep, { BusinessProfileArtefact } from '../steps/BusinessProfileStep';
import DomainStep, { DomainArtefact } from '../steps/DomainStep';

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
        'Your organisation\'s name and industry. The industry picks the playbooks every agent starts from.',
      Screen: BusinessProfileStep,
      Artefact: BusinessProfileArtefact,
    },
    {
      step_id: 'vani:domain',
      title: 'Your domain',
      shortLabel: 'Domain',
      summary: 'The domain your workspace runs on, so agents can address it.',
      Screen: DomainStep,
      Artefact: DomainArtefact,
    },
  ],
};
