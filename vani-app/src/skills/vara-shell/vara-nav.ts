/**
 * Vara workspace navigation catalog — separate from the console skills so
 * entering /agents/vara/* swaps the sidebar entirely.
 *
 * Group labels mirror the console's own vocabulary ("ORGANIZATION",
 * "SYSTEM") so returning tenants recognise the shape. Route ids that
 * begin `vara-` avoid collisions with the console catalog.
 */

import type { SkillModule } from '@/platform/registry';

const varaWorkspace: SkillModule = {
  id: 'vara-workspace',
  name: 'Vara',
  routes: [
    { id: 'vara-landing',      label: 'Landing',           href: '/agents/vara',                group: 'organization', icon: '⚑', status: 'live' },
    { id: 'vara-onboarding',   label: 'Onboarding',        href: '/agents/vara/onboarding',     group: 'organization', icon: '◉', status: 'live' },
    { id: 'vara-jd-studio',    label: 'JD Studio',         href: '/agents/vara/jd-studio',      group: 'workspace',    icon: '✎', status: 'live' },
    // The families screen existed with no entrance: it was reachable from the
    // onboarding doorway and by typing the URL, and nowhere else. "Where do I
    // see my saved families?" had no answer in the UI.
    { id: 'vara-families',     label: 'Role Families',     href: '/agents/vara/families',       group: 'workspace',    icon: '❏', status: 'live',
      summary: 'The families you have taken, and the rest of your industry\'s. Edit yours; every future JD in one starts from it.' },
    { id: 'vara-prompts',      label: 'Prompt Studio',     href: '/agents/vara/prompts',        group: 'workspace',    icon: '⌨', status: 'live',
      summary: 'System prompts + your workspace overrides for every LLM-driven worker.' },
    { id: 'vara-pulse',        label: 'Pulse',             href: '/agents/vara/pulse',          group: 'workspace',    icon: '▲', status: 'planned',
      summary: 'Overnight briefing: applied, closed, scored, above line, in window.' },
    { id: 'vara-map',          label: 'Probability Map',   href: '/agents/vara/map',            group: 'workspace',    icon: '◈', status: 'planned',
      summary: 'Every applicant by fitment; drag the threshold — reroute live.' },
    { id: 'vara-closing',      label: 'Closing Window',    href: '/agents/vara/closing',        group: 'workspace',    icon: '⏱', status: 'planned',
      summary: 'Timers, rescue picks, hold, close-now. No score rejects anyone.' },
    { id: 'vara-handover',     label: 'Handover Queue',    href: '/agents/vara/handover',       group: 'workspace',    icon: '▤', status: 'planned',
      summary: 'HM card queue: Interview or Pass with reason.' },
    { id: 'vara-calibration',  label: 'Calibration',       href: '/agents/vara/calibration',    group: 'workspace',    icon: '⚖', status: 'planned',
      summary: 'Loop health, proposals, human-gated approvals.' },
    // Leaves the Vara shell for the console's Settings. Without it a tenant
    // inside Vara had no route to appearance or model provider at all.
    { id: 'vara-settings',     label: 'Settings',          href: '/settings',                   group: 'system',       icon: '⚙', status: 'live' },
  ],
};

export const VARA_SKILLS: SkillModule[] = [varaWorkspace];
