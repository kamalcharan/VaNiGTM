/**
 * GTM workspace navigation catalog — entering /agents/gtm/* swaps the sidebar
 * for this, exactly as Vara's does. Pathways read as verbs (things you DO),
 * reference surfaces as nouns (things you LOOK AT). No top-level destination
 * is added: everything is a pathway, a drill-down, or a reference surface.
 *
 * The `journey` is the product surface of documents/gtm-journey-map.html —
 * rendered on the landing and on the dashboard card by platform/pathway/
 * AgentJourney. Progress comes from `gtm.journey` through the transport.
 */
import type { SkillModule } from '@/platform/registry';

const gtmWorkspace: SkillModule = {
  id: 'gtm-workspace',
  name: 'GTM',
  routes: [
    { id: 'gtm-landing',  label: 'Landing',              href: '/agents/gtm',          group: 'organization', icon: '⚑', status: 'live' },
    { id: 'gtm-today',    label: 'Today',                href: '/agents/gtm/today',    group: 'organization', icon: '◔', status: 'planned',
      summary: 'The queue: who has gone quiet, why, and what it costs to leave them. Fills the day after something is in motion. Sprint 3.' },
    { id: 'gtm-audience', label: 'Build the audience',   href: '/agents/gtm/audience', group: 'workspace',    icon: '◎', status: 'live',
      summary: 'Hot list → find → qualify → people. A list worth a message, in about ten minutes.' },
    { id: 'gtm-motion',   label: 'Put them in motion',   href: '/agents/gtm/motion',   group: 'workspace',    icon: '➤', status: 'planned',
      summary: 'Segment → story → cadence → send. Composition and the governor\'s window ship first; sending stays locked until consent exists. Sprint 3.' },
    { id: 'gtm-people',   label: 'People',               href: '/agents/gtm/people',   group: 'workspace',    icon: '◯', status: 'live',
      summary: 'Everyone in your audience — a reference surface, not a pathway.' },
    { id: 'gtm-journeys', label: 'Journeys',             href: '/agents/gtm/journeys', group: 'workspace',    icon: '⋯', status: 'planned',
      summary: 'Every person in motion, by stage. Reference surface. Sprint 3.' },
    { id: 'gtm-settings', label: 'Settings',             href: '/settings',            group: 'system',       icon: '⚙', status: 'live' },
  ],
  journey: {
    skill: 'gtm',
    fn: 'journey',
    steps: [
      { id: 'profile',  label: 'Profile ready',  href: '/smart-profile',
        summary: 'GTM reads your Smart Profile — buyer, offers, vocabulary, brand. Fit is scored against an offer, so at least one has to exist.' },
      { id: 'audience', label: 'Audience built', href: '/agents/gtm/audience',
        summary: 'A hot list from global data, the ones worth researching, briefs with evidence, and your verdict on each.' },
      { id: 'people',   label: 'People found',   href: '/agents/gtm/audience?step=people',
        summary: 'The decision-makers at every company you marked worth a message — with every source tried, hit or miss.' },
      { id: 'motion',   label: 'In motion',      href: '/agents/gtm/motion',
        summary: 'A segment, a story per segment, and the cadence window before anything is scheduled.' },
      { id: 'sending',  label: 'Sending',        href: '/agents/gtm/motion',
        locked: 'nothing sends until a consent and suppression model exists' },
    ],
  },
};

export const GTM_SKILLS: SkillModule[] = [gtmWorkspace];
export const GTM_WORKSPACE = gtmWorkspace;
