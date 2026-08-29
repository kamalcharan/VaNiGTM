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
  ],
};

export const VARA_SKILLS: SkillModule[] = [varaWorkspace];
