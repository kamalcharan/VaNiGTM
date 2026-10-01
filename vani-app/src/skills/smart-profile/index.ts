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
    // Offers are a BRAIN object with human intervention on every draft
    // (Charan, 2026-09-22), so they get their own entrance rather than living
    // only as a section of the profile page.
    {
      id: 'offers',
      label: 'Offers',
      href: '/smart-profile/offers',
      group: 'organization',
      icon: '◇',
      status: 'live',
      summary: 'What you sell, in the shape agents score against. VaNi drafts; you confirm.',
    },
    // The BRAIN's memory, checkable: what VaNi has read and what it learned.
    // A list, not a graph explorer — that stays off the roadmap.
    {
      id: 'knowledge',
      label: 'Knowledge',
      href: '/smart-profile/knowledge',
      group: 'organization',
      icon: '◫',
      status: 'live',
      summary: 'What VaNi has read, and what it learned from it — by kind, with the source. Teach it more here.',
    },
    // The same graph, as a graph: how what it learned connects. Charan,
    // 2026-09-26 — both surfaces were asked for; a list alone was not the ask.
    {
      id: 'knowledge-graph',
      label: 'Knowledge Graph',
      href: '/smart-profile/knowledge-graph',
      group: 'organization',
      icon: '⁂',
      status: 'live',
      summary: 'How what VaNi knows connects — product to buyer to pain to proof. Read-only; teach it to change it.',
    },
  ],
};

export default smartProfile;
