/**
 * The event types the worker actually dispatches.
 *
 * `AGENT_REGISTRY` in worker.ts is the truth at runtime, but it lives in the
 * worker process and imports every agent; the API cannot import it just to
 * answer "is anyone listening to this event?". So the list is stated here,
 * and the worker REFUSES TO START if its registry keys differ from it
 * (rule 12: a list that drifts silently is worse than none).
 *
 * Two readers:
 *   - the worker's CLAIM (PostgresEventQueue.poll → pollPendingEvents) takes
 *     only these types. Anything else stays `pending` until an agent for it is
 *     registered here and in AGENT_REGISTRY — then it runs, backlog included.
 *     (POA C6, 2026-09-30. Before it, the worker resolved them `done`.)
 *   - `runs.events` marks the rest `handled: false` with a waiting_reason.
 *     PROFILE_COMPLETE, PRESENTATION_READY and AGENT_FAILED are in that state
 *     today (2026-09-30).
 *
 * Adding a type here without a handler is refused at worker start; adding a
 * handler without the type here is refused too. Once both exist, every
 * waiting event of that type is picked up — decide whether the backlog should
 * run before shipping a new consumer (it will, oldest first).
 */
import type { EventType } from './event.store';

export const HANDLED_EVENT_TYPES: readonly EventType[] = [
  'TENANT_REGISTERED',
  'HUMAN_APPROVED',
  'FILE_UPLOADED',
  'URL_SUBMITTED',
  'FOLDER_CONNECTED',
  'COMPETITOR_RESEARCH_REQUESTED',
  'ACCOUNT_RESEARCH_REQUESTED',
  'FIT_LESSONS_REQUESTED',
  'KNOWLEDGE_UPDATED',
  'DOMAIN_ENRICHMENT_REQUESTED',
];

export function isHandledEvent(type: string): boolean {
  return (HANDLED_EVENT_TYPES as readonly string[]).includes(type);
}

/** Throws when the registry and the declared list disagree. Called by the worker at startup. */
export function assertRegistryMatches(registryKeys: string[]): void {
  const declared = new Set<string>(HANDLED_EVENT_TYPES);
  const actual = new Set(registryKeys);
  const missing = [...actual].filter((k) => !declared.has(k));
  const stale = [...declared].filter((k) => !actual.has(k));
  if (missing.length || stale.length) {
    throw new Error(
      `HANDLED_EVENT_TYPES is out of date — registered but not declared: [${missing.join(', ')}]; ` +
      `declared but not registered: [${stale.join(', ')}]. Update agent-core/handled-events.ts.`,
    );
  }
}
