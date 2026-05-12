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
  | 'FOLDER_CONNECTED';

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
  const result = await pool.query<GTEvent>(
    `UPDATE gt_events
        SET status = 'processing'
      WHERE id IN (
        SELECT id FROM gt_events
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING *`,
    [limit],
  );
  return result.rows;
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
