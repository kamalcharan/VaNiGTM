import type { SkillModule } from '@/platform/registry';

/**
 * Runs & Traces: what the agents did (every run and its steps), the bus
 * (every event, including the ones nobody consumes), and the queue of
 * things waiting on a person. All three read real rows since 2026-09-30;
 * the badge that used to say "5" was a fixture and is gone.
 */
const runs: SkillModule = {
  id: 'runs',
  name: 'Runs & Traces',
  routes: [
    { id: 'runs',          label: 'Runs & Traces',  href: '/runs',          group: 'system', icon: '⟳', status: 'live' },
    { id: 'runs-awaiting', label: 'Waiting on you', href: '/runs/awaiting', group: 'system', icon: '⏸', status: 'live',
      summary: 'Runs parked on a question — a failover to approve, an answer VaNi needs.' },
    { id: 'runs-events',   label: 'Events',         href: '/runs/events',   group: 'system', icon: '⇶', status: 'live',
      summary: 'The bus: every event, its attempts, and the ones no agent consumes.' },
  ],
};
export default runs;
