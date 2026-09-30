/**
 * The event types the worker actually dispatches.
 *
 * `AGENT_REGISTRY` in worker.ts is the truth at runtime, but it lives in the
 * worker process and imports every agent; the API cannot import it just to
 * answer "is anyone listening to this event?". So the list is stated here,
 * and the worker REFUSES TO START if its registry keys differ from it
 * (rule 12: a list that drifts silently is worse than none).
 *
 * `runs.events` uses it to mark an event as `handled: false` — emitted and
 * consumed by nothing. PROFILE_COMPLETE, PRESENTATION_READY and AGENT_FAILED
 * are in that state today (2026-09-30); the console now shows it instead of
 * the worker quietly resolving them `done`.
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
