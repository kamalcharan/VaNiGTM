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
    // The BRAIN object, rendered inside this shell: the same OffersScreen the
    // Smart Profile shows, at a GTM route so the sidebar stays. One editor,
    // two doors — never a second copy.
    { id: 'gtm-offers',   label: 'Offers',               href: '/agents/gtm/offers',   group: 'organization', icon: '◇', status: 'live',
      summary: 'What you sell, in the shape agents score against. VaNi drafts; you confirm.' },
    { id: 'gtm-today',    label: 'Today',                href: '/agents/gtm/today',    group: 'organization', icon: '◔', status: 'live',
      summary: 'The queue: who has gone quiet, why, and what it costs to leave them. Fills the day after something is in motion.' },
    { id: 'gtm-audience', label: 'Build the audience',   href: '/agents/gtm/audience', group: 'workspace',    icon: '◎', status: 'live',
      summary: 'Hot list → find → qualify → people. A list worth a message, in about ten minutes.' },
    { id: 'gtm-import',   label: 'Import a list',        href: '/agents/gtm/import',   group: 'workspace',    icon: '⤓', status: 'live',
      summary: 'Say what the file is to you, upload it, confirm what VaNi found and the mapping, and it lands. Clashes are held for your decision.' },
    { id: 'gtm-imports',  label: 'Imports',              href: '/agents/gtm/imports',  group: 'workspace',    icon: '▤', status: 'live',
      summary: 'Every import, row by row: what landed, what was already here, what needs your call, what failed and why. Reprocess, retry, or clear staging. A reference surface.' },
    // Cross-tenant data, admin only: the sidebar entry is filtered by the
    // shell and the server refuses the call for anyone else.
    { id: 'gtm-pool',     label: 'Common pool',          href: '/agents/gtm/pool',     group: 'workspace',    icon: '⛁', status: 'live', adminOnly: true,
      summary: 'The shared directory data every tenant draws on — one row per record per delivery, never merged silently. Vikuna feeds it; tenants read it through the hot list.' },
    { id: 'gtm-motion',   label: 'Put them in motion',   href: '/agents/gtm/motion',   group: 'workspace',    icon: '➤', status: 'live',
      summary: 'Segment → story → cadence → send. Sending stays locked until a consent model exists.' },
    { id: 'gtm-companies', label: 'Companies',           href: '/agents/gtm/companies', group: 'workspace',   icon: '▣', status: 'live',
      summary: 'Every company you hold — imported, from the pool, researched. A reference surface, not a pathway.' },
    { id: 'gtm-people',   label: 'People',               href: '/agents/gtm/people',   group: 'workspace',    icon: '◯', status: 'live',
      summary: 'Everyone in your audience — a reference surface, not a pathway.' },
    { id: 'gtm-journeys', label: 'Journeys',             href: '/agents/gtm/journeys', group: 'workspace',    icon: '⋯', status: 'live',
      summary: 'Every person in motion, by state. Reference surface.' },
    { id: 'gtm-channels', label: 'Channels & cadence',   href: '/agents/gtm/channels', group: 'workspace',    icon: '◫', status: 'live',
      summary: 'Channels, the cadence governor, the story library, the touch log — read-only.' },
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
