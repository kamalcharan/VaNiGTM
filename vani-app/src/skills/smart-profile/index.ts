/**
 * The Smart Profile skill — the record of what VaNi knows about the tenant.
 *
 * Separate from `onboarding`, which owns the BUILD flow. Two surfaces, one
 * dataset, and the split is deliberate: a pathway is for the first pass, a
 * record is for every time after. Editing deep-links back into the pathway
 * rather than duplicating its forms, so there is still exactly one editor per
 * field.
 */

import type { SkillModule } from '@/platform/registry';

const smartProfile: SkillModule = {
  id: 'smart-profile',
  name: 'Smart Profile',
  routes: [
    {
      id: 'smart-profile',
      label: 'Smart Profile',
      href: '/smart-profile',
      group: 'organization',
      icon: '◈',
      status: 'live',
      summary:
        'Everything VaNi knows about your business — company, market vocabulary, competitors, ideal customer and brand. Edit any part.',
    },
  ],
};

export default smartProfile;
