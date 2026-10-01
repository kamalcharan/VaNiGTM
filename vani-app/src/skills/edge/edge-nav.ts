/**
 * Edge workspace — the registry entry. One folder, one line in
 * src/skills/index.ts, no platform edits: the same shape as Vara and GTM.
 *
 * Edge is a guided mission, not a catalog, so its sidebar is the twelve
 * chapters rendered by EdgeShell rather than these routes; the routes exist
 * so the console knows the landing and so the journey card has a target.
 *
 * The journey is not in the reference (it had no console). Charan,
 * 2026-09-29: it syncs with the Smart Profile — step one is the inherited
 * context confirmed, and progress is read through `edge.journey`.
 */
import type { SkillModule } from '@/platform/registry';

const edgeWorkspace: SkillModule = {
  id: 'edge-workspace',
  name: 'Edge',
  routes: [
    { id: 'edge-landing', label: 'VaNi Edge', href: '/agents/edge', group: 'agents', icon: '◌', status: 'live',
      summary: 'Before you automate, know where you stand. A guided readiness and strategy mission over your P2P or O2C process.' },
  ],
  journey: {
    skill: 'edge',
    fn: 'journey',
    steps: [
      { id: 'context',  label: 'Context confirmed',  href: '/agents/edge/context',
        summary: 'Your Smart Profile carried into the mission: business, industry, footprint — corrected, not retyped.' },
      { id: 'process',  label: 'Process described', href: '/agents/edge/board',
        summary: 'People, scope, pain, the process board and its rules.' },
      { id: 'evidence', label: 'Evidence attached', href: '/agents/edge/evidence',
        summary: 'The records that can test the story, or the labelled sample.' },
      { id: 'pathways', label: 'Pathways decided',  href: '/agents/edge/explorer',
        summary: 'Every route explained and its handling agreed.' },
      { id: 'strategy', label: 'Strategy delivered', href: '/agents/edge/strategy',
        summary: 'The Automation Strategy, downloaded and dispatched.' },
    ],
  },
};

export const EDGE_WORKSPACE = edgeWorkspace;
