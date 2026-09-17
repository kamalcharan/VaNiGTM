/**
 * Vikuna Agent Core — Event Store
 *
 * gt_events is the event bus that wires agents together.
 *   - Routes write events (POST → emitEvent)
 *   - The worker polls pending events and dispatches to AGENT_REGISTRY
 *   - Resolved events are marked done/failed
 *
 * Cross-tenant reads (pollPendingEvents) use the pool directly — there is
 * no single tenant context for the poll. Tenant-scoped writes go through
 * createTenantDb so RLS is honoured.
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../db';

/* ── Event types ─────────────────────────────────────────────────────────── */

export type EventType =
  | 'TENANT_REGISTERED'
  | 'PROFILE_COMPLETE'
  | 'ICP_APPROVED'
  | 'LEADS_IMPORTED'
  | 'SEQUENCE_READY'
  | 'PRESENTATION_READY'
  | 'SCHEDULED_PULSE'
  | 'AGENT_FAILED'
  | 'HUMAN_APPROVED'
  | 'HUMAN_REJECTED'
  | 'WEBHOOK_RECEIVED'
  | 'FILE_INGESTED'
  // Phase 1 — ingestion pipeline (Addendum 02)
  | 'FILE_UPLOADED'
  | 'URL_SUBMITTED'
  | 'KNOWLEDGE_UPDATED'
  | 'FOLDER_CONNECTED'
  // GTM pipeline v2 — outward competitor research (research-skill)
  | 'COMPETITOR_RESEARCH_REQUESTED'
  // Manufacturing pilot — per-company research over a tagged cohort
  | 'ACCOUNT_RESEARCH_REQUESTED'
  // Learning Graph — derive fit rules from a reviewer's brief decisions
  | 'FIT_LESSONS_REQUESTED'
  // Domain packs — research an industry's role families so a tenant reaching
  // JD Studio has recommendations waiting. Emitted while they are still
  // onboarding, so the work runs alongside the rest of the wizard.
  | 'DOMAIN_ENRICHMENT_REQUESTED';

export type SourceType = 'human' | 'agent' | 'cron' | 'system' | 'webhook';
export type EventStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface GTEvent {
  id: string;
  tenant_id: string;
  event_type: EventType;
  source_type: SourceType;
  source_id: string | null;
  payload: Record<string, unknown>;
  status: EventStatus;
  processed_at: Date | null;
  error: string | null;
  created_at: Date;
}

/* ── Write ───────────────────────────────────────────────────────────────── */

/**
 * Emit a new event into the bus.
 * Returns the new event id. The worker will pick it up on its next poll.
 */
export async function emitEvent(
  pool: Pool,
  tenantId: string,
  eventType: EventType,
  sourceType: SourceType,
  payload: Record<string, unknown>,
  sourceId?: string,
): Promise<string> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{ id: string }>(
    `INSERT INTO gt_events (tenant_id, event_type, source_type, source_id, payload)
     VALUES ($tenant_id, $event_type, $source_type, $source_id, $payload::jsonb)
     RETURNING id`,
    {
      tenant_id:   tenantId,
      event_type:  eventType,
      source_type: sourceType,
      source_id:   sourceId ?? null,
      payload:     JSON.stringify(payload),
    },
  );
  return result.rows[0].id;
}

/* ── Poll (worker) ──────────────────────────────────────────────────────── */

/**
 * Atomically claim up to `limit` pending events.
 * Uses FOR UPDATE SKIP LOCKED so multiple workers can run in parallel
 * without picking the same row.
 *
 * Cross-tenant by design — this is the worker's poll, not a request handler.
 */
export async function pollPendingEvents(
  pool: Pool,
  limit = 10,
): Promise<GTEvent[]> {
  // The CTE form, NOT `WHERE id IN (SELECT ... LIMIT n)`. That reads as
  // though it claims n rows and does not: Postgres plans the sublink as a
  // Nested Loop Semi Join and re-runs the LIMIT subquery per outer row, so
  // EVERY pending event is claimed. `LIMIT 1` against three pending rows
  // claimed all three — verified with EXPLAIN, 2026-09-17.
  //
  // WORKER_BATCH_SIZE has therefore never been respected. Since
  // processEvent is fire-and-forget, twenty queued events meant twenty
  // agents running at once, each holding an LLM call. A CTE is a genuine
  // optimisation fence: it runs once, and the UPDATE joins its result.
  const result = await pool.query<GTEvent>(
    `WITH claimed AS (
       SELECT id FROM gt_events
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE gt_events e
        SET status     = 'processing',
            started_at = now(),
            attempts   = e.attempts + 1
       FROM claimed c
      WHERE e.id = c.id
      RETURNING e.*`,
    [limit],
  );
  return result.rows;
}

/* ── Orphan reclaim ──────────────────────────────────────────────────────── */

/**
 * How long a claimed row may go without a heartbeat before it is presumed
 * orphaned. Short on purpose: `heartbeat()` bumps `started_at` while a long
 * agent runs, so this is "how long since the worker last said it was alive",
 * not "how long a job may legitimately take". A global timeout of the second
 * kind would have to exceed the 20+ minute enrichment run, which would mean a
 * job that died after ten seconds also waited half an hour.
 */
const STALE_CLAIM = process.env.WORKER_STALE_CLAIM ?? '2 minutes';

/** Claims before an event is declared poison and failed rather than retried. */
const MAX_ATTEMPTS = parseInt(process.env.WORKER_MAX_ATTEMPTS ?? '3', 10);

/**
 * Return orphaned events to the queue, and fail the ones that keep killing it.
 *
 * The claim UPDATE commits immediately, so between it and `resolveEvent` the
 * only record that work is in flight is the worker's memory. A worker that
 * dies in that window — a deploy, a crash — leaves the row `processing`
 * forever, because the poll only ever looks at `pending`. Nine rows were
 * stranded this way on 2026-08-17 and nothing reported it: `processing` is a
 * legitimate state, and before migration 253 nothing recorded when it began.
 *
 * Two outcomes, and the second is why `attempts` exists. An event under the
 * cap goes back to `pending` and is retried. One at or over it is marked
 * `failed` with a reason — otherwise an event that kills the worker is
 * reclaimed, kills it again, and loops until someone notices.
 *
 * Runs on every poll. Cheap: the WHERE matches
 * `gt_events_stale_claim_idx` exactly, and returns nothing on a healthy queue.
 */
export async function reclaimStaleEvents(pool: Pool): Promise<{
  requeued: number; failed: number;
}> {
  const stale = `started_at IS NOT NULL AND started_at < now() - interval '${STALE_CLAIM}'`;

  const dead = await pool.query(
    `UPDATE gt_events
        SET status = 'failed', processed_at = now(),
            error = 'WORKER_ORPHANED: claimed ' || attempts
                    || ' times and never finished — the worker died mid-run each time'
      WHERE status = 'processing' AND ${stale} AND attempts >= $1
      RETURNING id`,
    [MAX_ATTEMPTS],
  );

  const back = await pool.query(
    `UPDATE gt_events
        SET status = 'pending', started_at = NULL
      WHERE status = 'processing' AND ${stale} AND attempts < $1
      RETURNING id`,
    [MAX_ATTEMPTS],
  );

  // Never silent. A reclaim means work was lost and redone, which is worth a
  // line in the log even though the queue recovers on its own.
  if (dead.rowCount || back.rowCount) {
    console.warn(
      `[Queue] Reclaimed orphaned events: ${back.rowCount} requeued, `
      + `${dead.rowCount} failed after ${MAX_ATTEMPTS} attempts`);
  }
  return { requeued: back.rowCount ?? 0, failed: dead.rowCount ?? 0 };
}

/**
 * "Still alive." Bumps the claim stamp so a long-running agent is not mistaken
 * for a dead worker.
 *
 * This is what keeps STALE_CLAIM short. Without it the threshold would have to
 * be longer than the slowest agent, and every genuine crash would sit
 * undetected for that long.
 */
export async function heartbeat(pool: Pool, eventId: string): Promise<void> {
  await pool.query(
    `UPDATE gt_events SET started_at = now()
      WHERE id = $1 AND status = 'processing'`,
    [eventId],
  );
}

/* ── Resolve ─────────────────────────────────────────────────────────────── */

/**
 * Mark an event as done or failed.
 * `error` is recorded only when status='failed'.
 */
export async function resolveEvent(
  pool: Pool,
  eventId: string,
  status: 'done' | 'failed',
  error?: string,
): Promise<void> {
  await pool.query(
    `UPDATE gt_events
        SET status       = $1,
            processed_at = now(),
            error        = $2
      WHERE id = $3`,
    [status, error ?? null, eventId],
  );
}
