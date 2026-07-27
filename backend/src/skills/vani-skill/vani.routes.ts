/**
 * VaNi REST routes — mounted at /api/v1/vani
 *
 *   GET  /status   → current tenant context + latest run
 *   GET  /runs     → list all runs for the tenant
 *   POST /gather   → conversation turn (tenant → VaNi reply + extracted nodes)
 *   POST /approve  → human approves profile (emits HUMAN_APPROVED)
 *   GET  /graph    → knowledge graph (nodes + edges)
 *
 * Auth: every endpoint requires a valid JWT; tenant_id is read from the
 * token, never from the body.
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../../auth/token.service';
import { createTenantDb } from '../../db';
import { emitEvent } from '../../agent-core/event.store';
import { getRuns, findResumableRun } from '../../agent-core/agent.runner';
import { VaniAgent } from './vani.agent';

/* ── Auth guard ─────────────────────────────────────────────────────────── */

function requireAuth(req: Request, res: Response): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
    return null;
  }
  try {
    return verifyAccessToken(auth.slice(7));
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return null;
  }
}

/* ── Router ─────────────────────────────────────────────────────────────── */

export function createVaniRouter(pool: Pool): Router {
  const router = Router();

  // ── GET /status ─────────────────────────────────────────────────────────
  router.get('/status', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const [context, runs] = await Promise.all([
        db.query(
          `SELECT profile, knowledge, daily_token_usage, daily_token_limit,
                  version, updated_at
             FROM gt_tenant_context
            WHERE tenant_id = $tenant_id`,
          { tenant_id: jwt.tenant_id },
        ),
        getRuns(pool, jwt.tenant_id, 'TENANT_REGISTERED', 1),
      ]);

      res.json({
        context:    context.rows[0] ?? null,
        latest_run: runs[0]         ?? null,
      });
    } catch (err) {
      console.error('[VaNi:/status]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /runs ───────────────────────────────────────────────────────────
  router.get('/runs', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const runs = await getRuns(pool, jwt.tenant_id);
      res.json({ runs });
    } catch (err) {
      console.error('[VaNi:/runs]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── POST /gather ────────────────────────────────────────────────────────
  router.post('/gather', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const { message, run_id } = (req.body ?? {}) as { message?: string; run_id?: string };

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        res.status(400).json({
          error: { code: 'MISSING_FIELDS', message: 'message is required' },
        });
        return;
      }

      // Resolve run id — UI may either pass one or rely on the most recent
      // gathering run for this tenant.
      const runId = run_id ?? await VaniAgent.findActiveRunId(pool, jwt.tenant_id);
      if (!runId) {
        res.status(400).json({
          error: { code: 'NO_ACTIVE_RUN', message: 'No active gathering run for tenant' },
        });
        return;
      }

      const result = await VaniAgent.conversationTurn(
        pool,
        jwt.tenant_id,
        runId,
        message,
      );

      res.json(result);
    } catch (err) {
      const msg = messageOf(err);
      console.error('[VaNi:/gather]', msg);
      if (msg.includes('TOKEN_BUDGET_EXCEEDED')) {
        res.status(429).json({
          error: { code: 'TOKEN_BUDGET_EXCEEDED', message: msg },
        });
        return;
      }
      if (msg.includes('LLM_VPS_UNREACHABLE') || msg.includes('LLM_VPS_ERROR')) {
        res.status(503).json({
          error: { code: 'LLM_UNAVAILABLE', message: 'Language model service is unavailable' },
        });
        return;
      }
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: msg },
      });
    }
  });

  // ── POST /approve ───────────────────────────────────────────────────────
  router.post('/approve', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const eventId = await emitEvent(
        pool,
        jwt.tenant_id,
        'HUMAN_APPROVED',
        'human',
        { context: 'profile_approval', approved_by: jwt.user_id },
        jwt.user_id,
      );

      res.json({
        success: true,
        message: 'Profile approval queued — worker will process shortly.',
        event_id: eventId,
      });
    } catch (err) {
      console.error('[VaNi:/approve]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /graph ──────────────────────────────────────────────────────────
  router.get('/graph', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);

      const [nodes, edges] = await Promise.all([
        db.query(
          `SELECT id, label, name, description, properties, created_at
             FROM gt_kg_nodes
            WHERE tenant_id = $tenant_id
            ORDER BY label, name`,
          { tenant_id: jwt.tenant_id },
        ),
        db.query(
          `SELECT e.id, e.relationship, e.properties,
                  fn.label AS from_label, fn.name AS from_name,
                  tn.label AS to_label,   tn.name AS to_name
             FROM gt_kg_edges e
             JOIN gt_kg_nodes fn ON fn.id = e.from_node_id
             JOIN gt_kg_nodes tn ON tn.id = e.to_node_id
            WHERE e.tenant_id = $tenant_id`,
          { tenant_id: jwt.tenant_id },
        ),
      ]);

      res.json({ nodes: nodes.rows, edges: edges.rows });
    } catch (err) {
      console.error('[VaNi:/graph]', err);
      res.status(500).json({
        error: { code: 'INTERNAL_ERROR', message: messageOf(err) },
      });
    }
  });

  // ── GET /competitors ─────────────────────────────────────────────────────
  // The competitors VaNi mapped (research + crawl + conversation), minus the
  // ones the human dismissed — dismissed nodes stay in the KG as the ignore
  // list (research-skill never re-proposes them) but never surface here.
  router.get('/competitors', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query<{
        id: string;
        name: string;
        description: string | null;
        properties: Record<string, unknown>;
      }>(
        `SELECT id, name, description, properties
           FROM gt_kg_nodes
          WHERE tenant_id = $tenant_id AND label = 'Competitor'
            AND COALESCE((properties->>'dismissed')::boolean, false) = false
          ORDER BY name`,
        { tenant_id: jwt.tenant_id },
      );
      res.json({ competitors: result.rows });
    } catch (err) {
      console.error('[VaNi:/competitors]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── POST /competitors/research ───────────────────────────────────────────
  // Kick off outward competitor research (research-skill agent): profile →
  // search queries → SearXNG → verify candidate sites → KG Competitor nodes.
  // Deduped: an already queued/running research run is returned instead of
  // emitting a second event.
  //
  // Body { resume: true } → resume-from-failure: the latest failed run's
  // checkpoint (migration 191, ≤24h old) is picked up and completed stages
  // are skipped. No resumable run → starts fresh (resumed:false says so).
  router.post('/competitors/research', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const active = await db.query<{ id: string }>(
        `SELECT id::text FROM gt_agent_runs
          WHERE tenant_id = $tenant_id
            AND agent_name = 'COMPETITOR_RESEARCH_REQUESTED'
            AND status IN ('queued', 'running')
          ORDER BY created_at DESC
          LIMIT 1`,
        { tenant_id: jwt.tenant_id },
      );
      if (active.rows[0]) {
        res.json({ already_running: true, run_id: active.rows[0].id });
        return;
      }

      const wantResume = (req.body ?? {}).resume === true;
      let resumeRunId: string | null = null;
      if (wantResume) {
        const resumable = await findResumableRun(
          pool, jwt.tenant_id, 'COMPETITOR_RESEARCH_REQUESTED',
        );
        resumeRunId = resumable?.id ?? null;
      }

      const eventId = await emitEvent(
        pool,
        jwt.tenant_id,
        'COMPETITOR_RESEARCH_REQUESTED',
        'human',
        {
          requested_by: jwt.user_id,
          ...(resumeRunId ? { resume_run_id: resumeRunId } : {}),
        },
        jwt.user_id,
      );
      res.json({ already_running: false, event_id: eventId, resumed: Boolean(resumeRunId) });
    } catch (err) {
      console.error('[VaNi:/competitors/research]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── GET /competitors/research-status ─────────────────────────────────────
  // Latest research run for the wizard's live feed: status + real agent
  // steps + output/error. Null run = never researched.
  router.get('/competitors/research-status', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      const result = await db.query<{
        id: string;
        status: string;
        steps: unknown;
        output: Record<string, unknown> | null;
        error_trace: string | null;
        created_at: Date;
      }>(
        `SELECT id::text, status, steps, output, error_trace, created_at
           FROM gt_agent_runs
          WHERE tenant_id = $tenant_id
            AND agent_name = 'COMPETITOR_RESEARCH_REQUESTED'
          ORDER BY created_at DESC
          LIMIT 1`,
        { tenant_id: jwt.tenant_id },
      );
      res.json({ run: result.rows[0] ?? null });
    } catch (err) {
      console.error('[VaNi:/competitors/research-status]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  // ── POST /competitors/confirm ────────────────────────────────────────────
  // Human ruling on the competitor map: kept nodes are stamped
  // properties.confirmed=true (a signal Storyteller/campaigns can ground
  // on); removed nodes are DISMISSED, not deleted — they become the ignore
  // list. The node stays in the KG with dismissed=true so a future
  // research run (or crawl upsert, which merges properties) can never
  // re-propose a company the human already ruled out. Confirming an empty
  // keep list is valid — some tenants genuinely have no named competitors.
  router.post('/competitors/confirm', async (req: Request, res: Response) => {
    const jwt = requireAuth(req, res);
    if (!jwt) return;

    const body = (req.body ?? {}) as { keep?: unknown; remove?: unknown };
    const keep = Array.isArray(body.keep) ? body.keep.filter((x): x is string => typeof x === 'string') : [];
    const remove = Array.isArray(body.remove) ? body.remove.filter((x): x is string => typeof x === 'string') : [];

    try {
      const db = createTenantDb(pool, jwt.tenant_id);
      await db.transaction(async (tx) => {
        for (const id of remove) {
          await tx.query(
            `UPDATE gt_kg_nodes
                SET properties = properties || '{"dismissed": true, "confirmed": false}'::jsonb,
                    updated_at = now()
              WHERE id = $id AND tenant_id = $tenant_id AND label = 'Competitor'`,
            { id, tenant_id: jwt.tenant_id },
          );
        }
        for (const id of keep) {
          await tx.query(
            `UPDATE gt_kg_nodes
                SET properties = properties || '{"confirmed": true}'::jsonb,
                    updated_at = now()
              WHERE id = $id AND tenant_id = $tenant_id AND label = 'Competitor'`,
            { id, tenant_id: jwt.tenant_id },
          );
        }
      });

      res.json({ success: true, kept: keep.length, dismissed: remove.length });
    } catch (err) {
      console.error('[VaNi:/competitors/confirm]', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: messageOf(err) } });
    }
  });

  return router;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
