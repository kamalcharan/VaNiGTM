/**
 * Vikuna Agent Core — Worker
 *
 * Separate process. Polls gt_events for pending rows and dispatches each
 * event to a registered agent handler.
 *
 *   Run: node dist/agent-core/worker.js
 *   Dev: tsx src/agent-core/worker.ts
 *
 * Architecture:
 *   - EventQueue interface — PostgresEventQueue today, BullMQ later.
 *     Swap implementations without touching agent handlers.
 *   - AGENT_REGISTRY maps event_type → handler. New agents register here.
 *   - Per event: create a gt_agent_runs row, run the handler, mark the
 *     event done/failed. On failure, also emit AGENT_FAILED so the
 *     alert pipeline can notify the tenant.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { createTenantDb } from '../db';
import { emitEvent, type GTEvent } from './event.store';
import { createRun, setStatus, appendStep } from './agent.runner';
import { VaniAgent } from '../skills/vani-skill/vani.agent';
import { IngestionAgent } from '../skills/ingestion-skill/ingestion.agent';

/* ── Event Queue interface ──────────────────────────────────────────────── */

export interface EventQueue {
  poll(limit: number): Promise<GTEvent[]>;
  resolve(eventId: string, status: 'done' | 'failed', error?: string): Promise<void>;
}

/* ── Postgres implementation (current) ──────────────────────────────────── */

export class PostgresEventQueue implements EventQueue {
  constructor(private readonly pool: Pool) {}

  async poll(limit: number): Promise<GTEvent[]> {
    const result = await this.pool.query<GTEvent>(
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

  async resolve(eventId: string, status: 'done' | 'failed', error?: string): Promise<void> {
    await this.pool.query(
      `UPDATE gt_events
          SET status       = $1,
              processed_at = now(),
              error        = $2
        WHERE id = $3`,
      [status, error ?? null, eventId],
    );
  }
}

// TODO NEXT STAGE: BullMQEventQueue implements EventQueue
// const queue = new BullMQEventQueue(redisConnection);
// Zero changes to processEvent or AGENT_REGISTRY.

/* ── Agent registry ─────────────────────────────────────────────────────── */

type AgentHandler = (
  pool: Pool,
  tenantId: string,
  payload: Record<string, unknown>,
  runId: string,
) => Promise<void>;

const AGENT_REGISTRY: Record<string, AgentHandler> = {
  TENANT_REGISTERED: (pool, tenantId, payload, runId) =>
    VaniAgent.handleTenantRegistered(pool, tenantId, payload, runId),
  HUMAN_APPROVED: (pool, tenantId, payload, runId) =>
    VaniAgent.handleHumanApproved(pool, tenantId, payload, runId),

  // Ingestion pipeline (Phase 1 / Addendum 02)
  FILE_UPLOADED: (pool, tenantId, payload, runId) =>
    IngestionAgent.run(pool, tenantId, payload, runId),
  URL_SUBMITTED: (pool, tenantId, payload, runId) =>
    IngestionAgent.run(pool, tenantId, payload, runId),

  // FOLDER_CONNECTED fires immediately after OAuth — folder_id may still
  // be null (tenant hasn't picked a folder yet). Guard the sync call so
  // the coordination run completes cleanly in either case. Once the
  // tenant PATCHes a folder and triggers POST /sync, the real ingestion
  // FILE_UPLOADED events flow as expected.
  FOLDER_CONNECTED: async (pool, tenantId, _payload, runId) => {
    const db = createTenantDb(pool, tenantId);
    const result = await db.query<{ folder_id: string | null }>(
      `SELECT folder_id FROM gt_tenant_integrations
        WHERE tenant_id = $tenant_id AND provider = 'gdrive'`,
      { tenant_id: tenantId },
    );
    const folderSet = !!result.rows[0]?.folder_id;
    if (folderSet) {
      await IngestionAgent.syncFolder(pool, tenantId);
    }
    await setStatus(pool, runId, 'completed', {
      output: {
        message: folderSet
          ? 'GDrive connected and folder sync triggered'
          : 'GDrive connected — folder not set yet',
      },
    });
  },

  // Future agents — add here, nothing else changes:
  // PROFILE_COMPLETE: (pool, tenantId, payload, runId) => ICPAgent.run(...)
  // ICP_APPROVED:     (pool, tenantId, payload, runId) => LeadAgent.run(...)
};

/* ── Process one event ──────────────────────────────────────────────────── */

async function processEvent(
  pool: Pool,
  queue: EventQueue,
  event: GTEvent,
): Promise<void> {
  const handler = AGENT_REGISTRY[event.event_type];

  if (!handler) {
    // No agent registered for this event type yet — mark done and move on.
    await queue.resolve(event.id, 'done');
    return;
  }

  const runId = await createRun(pool, event.tenant_id, event.event_type, event.id);

  try {
    await setStatus(pool, runId, 'running');
    await appendStep(pool, runId, {
      step_name:     'init',
      action:        `Processing event: ${event.event_type}`,
      input_summary: JSON.stringify(event.payload).slice(0, 200),
      status:        'ok',
    });

    await handler(pool, event.tenant_id, event.payload, runId);

    // Handler may have transitioned the run to 'awaiting' (e.g. VaNi waiting
    // for the human to respond). Don't force a status here — let the agent
    // own its final state. Only the event itself is marked done.
    await queue.resolve(event.id, 'done');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error(`[Worker] Agent failed — event ${event.id} (${event.event_type}):`, error.message);

    await setStatus(pool, runId, 'failed', {
      error_trace:     error.stack ?? error.message,
      last_checkpoint: 'see steps array',
    });
    await queue.resolve(event.id, 'failed', error.message);

    // Notify downstream — alert-skill will subscribe to AGENT_FAILED.
    try {
      await emitEvent(
        pool,
        event.tenant_id,
        'AGENT_FAILED',
        'agent',
        {
          failed_event_type: event.event_type,
          run_id: runId,
          error:  error.message,
        },
        runId,
      );
    } catch (alertErr) {
      console.error('[Worker] Failed to emit AGENT_FAILED event:', alertErr);
    }
  }
}

/* ── Poll loop ──────────────────────────────────────────────────────────── */

const POLL_INTERVAL_MS = parseInt(process.env.WORKER_POLL_MS   ?? '3000', 10);
const POLL_BATCH_SIZE  = parseInt(process.env.WORKER_BATCH_SIZE ?? '5',    10);

let pollTimeout: NodeJS.Timeout | null = null;
let stopping = false;

async function pollOnce(pool: Pool, queue: EventQueue): Promise<void> {
  if (stopping) return;
  try {
    const events = await queue.poll(POLL_BATCH_SIZE);
    for (const event of events) {
      // Fire and forget — one failure must not block siblings.
      processEvent(pool, queue, event).catch(err =>
        console.error(`[Worker] Unhandled error for event ${event.id}:`, err),
      );
    }
  } catch (err) {
    console.error('[Worker] Poll error:', err);
  }
  pollTimeout = setTimeout(() => void pollOnce(pool, queue), POLL_INTERVAL_MS);
}

export function startWorker(pool: Pool, queue: EventQueue): void {
  console.log(
    `[Worker] Starting — polling every ${POLL_INTERVAL_MS}ms, batch size ${POLL_BATCH_SIZE}`,
  );
  void pollOnce(pool, queue);
}

/* ── Entry point ────────────────────────────────────────────────────────── */

// Only run the bootstrap when this file is the main module — keeps it
// importable from tests / server for in-process worker scenarios.
const isMain = require.main === module;

if (isMain) {
  const pool = new Pool({
    connectionString: process.env.DB_PRIMARY,
    ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });

  const queue = new PostgresEventQueue(pool);
  // TODO NEXT STAGE: const queue = new BullMQEventQueue(redisConnection);

  startWorker(pool, queue);

  const shutdown = async (signal: string) => {
    console.log(`\n[Worker] ${signal} received — shutting down gracefully...`);
    stopping = true;
    if (pollTimeout) clearTimeout(pollTimeout);
    await pool.end().catch(() => {});
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT',  () => void shutdown('SIGINT'));
}
