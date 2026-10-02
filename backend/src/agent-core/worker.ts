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

import { assertBudgetConfig } from './token.budget';
import 'dotenv/config';
import { Pool } from 'pg';
import { createTenantDb } from '../db';
import { emitEvent, reclaimStaleEvents, heartbeat, pollPendingEvents, type GTEvent } from './event.store';
import { createRun, setStatus, appendStep } from './agent.runner';
import { assertRegistryMatches, HANDLED_EVENT_TYPES } from './handled-events';
import { readLlmConfig, assertLlmConfig } from './llm.config';
import { readWorkerConfig, assertWorkerConfig } from './worker.config';
import { assertEtlConfig } from '../etl/etl.config';
import { assertPoolConfig } from '../etl/pool.config';
import { assertRouterConfig } from './llm.router.config';
import { runScoreRefreshJob } from '../scoring/rescore';
import { runPoolResolveJob } from '../etl/pool-merge';
import { runStageJob } from '../etl/stage-job';
import { VaniAgent } from '../skills/vani-skill/vani.agent';
import { IngestionAgent } from '../skills/ingestion-skill/ingestion.agent';
import { CompetitorResearchAgent } from '../skills/research-skill/research.agent';
import { AccountResearchAgent } from '../skills/research-skill/account.agent';
import { FitLessonAgent } from '../skills/research-skill/lesson.agent';
import { DomainPackAgent } from '../skills/domain-pack-skill/domain-pack.agent';
import { runSiteRead } from '../funnel/funnel.service';
import { recalculateProfileFromNodes } from '../skills/profile-skill/profile.service';
import { generateClusters, listClusters } from '../skills/profile-skill/cluster.service';

/* ── Event Queue interface ──────────────────────────────────────────────── */

export interface EventQueue {
  poll(limit: number): Promise<GTEvent[]>;
  resolve(eventId: string, status: 'done' | 'failed', error?: string): Promise<void>;
}

/* ── Postgres implementation (current) ──────────────────────────────────── */

export class PostgresEventQueue implements EventQueue {
  constructor(private readonly pool: Pool) {}

  async poll(limit: number): Promise<GTEvent[]> {
    // One claim, in event.store — this class used to carry a second copy of the
    // same CTE, which is how two claim sites drift. Only the types this worker
    // can run are claimed; anything else waits in `pending` (see
    // pollPendingEvents for why the filter lives in the claim).
    return pollPendingEvents(this.pool, limit, HANDLED_EVENT_TYPES);
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

  // Track E1 — a visitor's homepage + one drafter call, before signup. Runs
  // under the vikuna-funnel system tenant (its daily cap is the anonymous
  // ceiling); the data stays in vani_anon_site_read (src/funnel).
  FUNNEL_SITE_SUBMITTED: (pool, tenantId, payload, runId) =>
    runSiteRead(pool, tenantId, payload, runId),

  // Common pool P1 — a large CSV staged in chunks, resumable (src/etl/stage-job.ts).
  IMPORT_STAGE_REQUESTED: (pool, tenantId, payload, runId) =>
    runStageJob(pool, tenantId, payload, runId).then(() => undefined),

  // Common pool P1-B — match, derive, Complete test; resumable (src/etl/pool-merge.ts).
  POOL_RESOLVE_REQUESTED: (pool, tenantId, payload, runId) =>
    runPoolResolveJob(pool, tenantId, payload, runId).then(() => undefined),

  // Release 3 — re-score after a profile change or on request (src/scoring/rescore.ts).
  SCORE_REFRESH_REQUESTED: (pool, tenantId, payload, runId) =>
    runScoreRefreshJob(pool, tenantId, payload, runId).then(() => undefined),

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

  // Outward competitor research (GTM pipeline v2 stage 1) — competitors
  // are researched from the profile/ICP, not scraped off the tenant's own
  // site. Triggered by the wizard's competitors step (or a manual re-run).
  COMPETITOR_RESEARCH_REQUESTED: (pool, tenantId, payload, runId) =>
    CompetitorResearchAgent.run(pool, tenantId, payload, runId),

  // Per-company research for the manufacturing pilot: crawl a prospect's own
  // site, extract evidence-bound facts, score the tenant's offer catalogue
  // against them, and write gt_account_briefs. One run covers the whole
  // cohort and checkpoints after each account.
  ACCOUNT_RESEARCH_REQUESTED: (pool, tenantId, payload, runId) =>
    AccountResearchAgent.run(pool, tenantId, payload, runId),

  // The Learning Graph. Reads every brief the reviewer has ruled on and
  // PROPOSES the rules behind those rulings, each carrying the companies it
  // was inferred from. Nothing it proposes affects scoring until a human
  // accepts it — the agent never ratifies its own inference.
  FIT_LESSONS_REQUESTED: (pool, tenantId, payload, runId) =>
    FitLessonAgent.run(pool, tenantId, payload, runId),

  // Fires after IngestionAgent.run() writes nodes from any source (Drive
  // file today; direct upload / URL once those entry points exist).
  // Recomputes the typed profile from current gt_kg_nodes state — same
  // shared function VaniAgent.handleHumanApproved() calls — and emits
  // PROFILE_COMPLETE if this crosses the threshold.
  KNOWLEDGE_UPDATED: async (pool, tenantId, _payload, runId) => {
    const result = await recalculateProfileFromNodes(
      pool,
      tenantId,
      'ingestion-skill',
      'Recalculated from ingested knowledge nodes',
      runId,
    );

    // Market vocabulary (gt_semantic_clusters): drafted here so it rides the
    // existing pipeline instead of adding a wizard step. Refreshes freely
    // while the tenant hasn't ratified it — once they approve, the
    // vocabulary is theirs and only an explicit regenerate touches it.
    let clusterCount: number | null = null;
    if (result.profile.product_name || result.profile.product_description) {
      try {
        const approved = await listClusters(pool, tenantId, { approvedOnly: true });
        if (approved.length === 0) {
          const clusters = await generateClusters(pool, tenantId, runId);
          clusterCount = clusters.length;
          await appendStep(pool, runId, {
            step_name:      'market_vocabulary',
            action:         'Mapped the market vocabulary your buyers search',
            output_summary: clusters.map((c) => c.primary_term).join(', ') || 'none',
            status:         'ok',
          });
        }
      } catch (err) {
        // Vocabulary is an enhancement to an already-successful profile
        // recalc — surface it loudly as a failed STEP, but don't fail the
        // run and lose the profile update (rule 12: visible, not silent).
        await appendStep(pool, runId, {
          step_name:      'market_vocabulary',
          action:         'Could not map the market vocabulary',
          output_summary: (err instanceof Error ? err.message : String(err)).slice(0, 200),
          status:         'error',
        });
      }
    }

    await setStatus(pool, runId, 'completed', {
      output: {
        profile_id:          result.profile.id,
        completion_score:    result.profile.completion_score,
        crossed_threshold:   result.crossedCompletionThreshold,
        missing_fields:      result.missingFields,
        ...(clusterCount !== null ? { clusters_drafted: clusterCount } : {}),
      },
    });
  },

  // Domain packs — research an industry's role families in the background
  // while the tenant is still onboarding. The handler decides whether the
  // work is needed (another tenant in the same industry may already have
  // triggered it), so this fires on every business_profile completion.
  DOMAIN_ENRICHMENT_REQUESTED: (pool, tenantId, payload, runId) =>
    DomainPackAgent.run(pool, tenantId, payload, runId),

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
    // Unreachable in normal operation: the claim only takes HANDLED_EVENT_TYPES,
    // and startWorker refuses to run if that list and this registry disagree.
    // If it happens anyway it is a bug, and it says so — it is never `done`,
    // which is what this branch used to write for every event nobody handled.
    console.error(`[Worker] Claimed ${event.event_type} (${event.id}) but no handler is registered`);
    await queue.resolve(event.id, 'failed',
      `NO_HANDLER: no agent is registered for ${event.event_type}`);
    return;
  }

  // The payload rides on the run so per-run permissions (allow_failover) and
  // per-run claims can be read back without joining to the event.
  const runId = await createRun(pool, event.tenant_id, event.event_type, event.id, event.payload ?? {});

  try {
    await setStatus(pool, runId, 'running');
    await appendStep(pool, runId, {
      step_name:     'init',
      action:        `Processing event: ${event.event_type}`,
      input_summary: JSON.stringify(event.payload).slice(0, 200),
      status:        'ok',
    });

    // Say "still alive" while the handler works. Enrichment runs 20+ minutes;
    // without this the reclaim threshold would have to exceed the slowest
    // agent, and a worker that died after ten seconds would sit undetected for
    // that long. The interval is unref'd so it can never hold the process open.
    const beat = setInterval(() => {
      void heartbeat(pool, event.id).catch(() => { /* a missed beat is not fatal */ });
    }, workerCfg().heartbeatMs);
    beat.unref?.();
    try {
      await handler(pool, event.tenant_id, event.payload, runId);
    } finally {
      clearInterval(beat);
    }

    // Handler may have transitioned the run to 'awaiting' (e.g. VaNi waiting
    // for the human to respond). Don't force a status here — let the agent
    // own its final state. Only the event itself is marked done.
    await queue.resolve(event.id, 'done');
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));

    // Not a failure — a question. With HAIKU_DEFAULT=false the platform model
    // being unreachable is something a person decides about, because the
    // alternative costs Vikuna money on every call. The run parks with the
    // REAL diagnosis rather than failing, so approving it is one click and the
    // cause is right there to read.
    if (error.message.startsWith('LLM_FAILOVER_NEEDS_APPROVAL')) {
      const cause = error.message.replace('LLM_FAILOVER_NEEDS_APPROVAL: ', '');
      console.warn(`[Worker] Run ${runId} needs a decision on failover: ${cause}`);
      await appendStep(pool, runId, {
        step_name:      'llm_failover_asked',
        action:         'The platform model is unreachable — waiting on a decision',
        output_summary: cause.slice(0, 200),
        status:         'skipped',   // nothing was done; the run is waiting on a person
      });
      await setStatus(pool, runId, 'awaiting', {
        awaiting_input: {
          kind: 'llm_failover_approval',
          event_id: event.id,
          event_type: event.event_type,
          failover_model: readLlmConfig().failoverModel,
          vps_error: cause,
          question: 'The platform model did not answer. Run this on Vikuna\'s '
            + 'Claude key instead? It will finish, and Vikuna is billed for it.',
        },
      });
      // 'done' on purpose: this event is finished with. Approving emits a NEW
      // event carrying allow_failover, so a stuck decision cannot also look
      // like a stuck queue.
      await queue.resolve(event.id, 'done');
      return;
    }

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

// WORKER_POLL_MS / _HEARTBEAT_MS / _BATCH_SIZE from .env (worker.config.ts), no defaults.
const workerCfg = () => readWorkerConfig();
/** How often a running handler stamps "still alive". Must be comfortably
 *  shorter than WORKER_STALE_CLAIM_SECONDS or a healthy long job reclaims itself. */


let pollTimeout: NodeJS.Timeout | null = null;
let stopping = false;

async function pollOnce(pool: Pool, queue: EventQueue): Promise<void> {
  if (stopping) return;
  try {
    // Before claiming anything new, return what a dead worker abandoned.
    // Cheap on a healthy queue — the WHERE matches gt_events_stale_claim_idx
    // and selects nothing.
    await reclaimStaleEvents(pool);

    const events = await queue.poll(workerCfg().batchSize);
    for (const event of events) {
      // Fire and forget — one failure must not block siblings.
      processEvent(pool, queue, event).catch(err =>
        console.error(`[Worker] Unhandled error for event ${event.id}:`, err),
      );
    }
  } catch (err) {
    console.error('[Worker] Poll error:', err);
  }
  pollTimeout = setTimeout(() => void pollOnce(pool, queue), workerCfg().pollMs);
}

export function startWorker(pool: Pool, queue: EventQueue): void {
  // Refuse to start on a stale declaration: runs.events marks an event as
  // unconsumed from HANDLED_EVENT_TYPES, and a list that drifts from this
  // registry would report the wrong thing while looking authoritative.
  assertRegistryMatches(Object.keys(AGENT_REGISTRY));
  // Every LLM setting from .env, checked before the first claim: a worker that
  // starts on a missing model URL claims events and fails each one, which is
  // the same outage reported N times instead of once, here.
  assertLlmConfig('Worker');
  assertWorkerConfig();
  assertEtlConfig('Worker');
  assertPoolConfig('Worker');
  assertRouterConfig('Worker');
  assertBudgetConfig('Worker');
  console.log(
    `[Worker] Starting — polling every ${workerCfg().pollMs}ms, batch size ${workerCfg().batchSize}`,
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
