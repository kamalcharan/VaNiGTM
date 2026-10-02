/**
 * GET /api/v1/runs/:id/stream — one run, live, as server-sent events
 * (AGENTS.md §9a, POA Sprint 0a). Replaces polling: the console opens it
 * while a run works and sees each step the moment the harness writes it.
 *
 * Event vocabulary (borrowed from AG-UI, no dependency on it):
 *   run_started       the run as it stands (sent once on connect)
 *   step_finished     one step, in order — `id` is its index, so a reconnect
 *                     with Last-Event-ID (or ?after=) resumes after it
 *   decision_needed   the run parked at `awaiting`; what it asks
 *   run_finished      completed — the stream ends
 *   run_failed        failed — the stream ends, with the error
 *   stream_expired    RUNS_STREAM_MAX_SECONDS reached — reconnect to continue
 *
 * The harness writes steps to gt_agent_runs, so this reads them there every
 * RUNS_STREAM_POLL_MS: one small query per open stream, and nothing about the
 * agents changes. A browser's EventSource cannot send the bearer token, so
 * the console reads the stream with fetch() and a header.
 *
 * gt_agent_runs has RLS off by design (migration 237): the tenant filter in
 * the query is the isolation, and another tenant's run is a plain 404.
 */
import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { resolveAuth } from '../auth/auth-context';
import { agentOf } from '../agent-core/agent-names';

export interface RunStreamConfig { pollMs: number; heartbeatMs: number; maxSeconds: number }

export class RunStreamConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`RUNS_STREAM_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'RunStreamConfigError';
  }
}

export function readRunStreamConfig(env: NodeJS.ProcessEnv = process.env): RunStreamConfig {
  const problems: string[] = [];
  const int = (name: string, min: number) => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${raw} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };
  const c = { pollMs: int('RUNS_STREAM_POLL_MS', 100), heartbeatMs: int('RUNS_STREAM_HEARTBEAT_MS', 1000), maxSeconds: int('RUNS_STREAM_MAX_SECONDS', 10) };
  if (problems.length) throw new RunStreamConfigError(problems);
  return c;
}

export function assertRunStreamConfig(who: string): RunStreamConfig {
  const c = readRunStreamConfig();
  console.log(`[${who}] Run stream: poll ${c.pollMs}ms, heartbeat ${c.heartbeatMs}ms, up to ${c.maxSeconds}s per connection`);
  return c;
}

const TERMINAL = new Set(['completed', 'failed']);

export function createRunStreamRouter(pool: Pool): Router {
  const router = Router();

  router.get('/:id/stream', async (req: Request, res: Response) => {
    const auth = resolveAuth(req.headers.authorization);
    if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }
    const runId = Number(req.params.id);
    if (!Number.isInteger(runId)) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'A run id is a number.' } }); return; }

    let cfg: RunStreamConfig;
    try { cfg = readRunStreamConfig(); } catch (e) {
      res.status(500).json({ error: { code: 'RUNS_STREAM_CONFIG_INVALID', message: (e as Error).message } }); return;
    }

    const read = async () => (await pool.query(
      `SELECT r.id::text, r.agent_name, r.status, r.steps, r.awaiting_input, r.error_message,
              r.started_at, r.completed_at, e.event_type
         FROM gt_agent_runs r LEFT JOIN gt_events e ON e.id = r.event_id
        WHERE r.id = $1 AND r.tenant_id = $2`, [runId, auth.tenant_id])).rows[0];

    let run: any;
    try { run = await read(); } catch (e) {
      console.error('[RunStream]', e);
      res.status(500).json({ error: { code: 'STREAM_FAILED', message: 'Could not read the run.' } }); return;
    }
    if (!run) { res.status(404).json({ error: { code: 'NOT_FOUND', message: `Run ${runId} not found.` } }); return; }

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',          // nginx: do not buffer this response
    });
    res.flushHeaders?.();

    let closed = false;
    res.on('close', () => { closed = true; });   // the client went away (res, not req: a request's 'close' can fire once its body is read)
    const send = (event: string, data: unknown, id?: number) => {
      if (closed) return;
      res.write(`${id !== undefined ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const resumeAfter = Number(req.headers['last-event-id'] ?? req.query.after);
    let sent = Number.isInteger(resumeAfter) && resumeAfter >= 0 ? resumeAfter + 1 : 0;
    let lastStatus = '';
    const startedAt = Date.now();
    let lastBeat = Date.now();

    send('run_started', {
      run_id: run.id, agent: agentOf(run.agent_name), trigger: run.event_type ?? run.agent_name,
      status: run.status, started_at: run.started_at, steps_so_far: (run.steps ?? []).length,
    });

    const tick = async (): Promise<boolean> => {
      const steps: any[] = run.steps ?? [];
      for (; sent < steps.length; sent++) send('step_finished', steps[sent], sent);
      if (run.status !== lastStatus) {
        lastStatus = run.status;
        if (run.status === 'awaiting') send('decision_needed', { run_id: run.id, awaiting_input: run.awaiting_input });
        if (run.status === 'completed') send('run_finished', { run_id: run.id, completed_at: run.completed_at });
        if (run.status === 'failed') send('run_failed', { run_id: run.id, error: run.error_message });
      }
      return TERMINAL.has(run.status);
    };

    try {
      while (!closed) {
        if (await tick()) break;
        if (Date.now() - startedAt >= cfg.maxSeconds * 1000) {
          send('stream_expired', { run_id: run.id, resume_after: sent - 1 });
          break;
        }
        if (Date.now() - lastBeat >= cfg.heartbeatMs) { if (!closed) res.write(': keepalive\n\n'); lastBeat = Date.now(); }
        await new Promise((r) => setTimeout(r, cfg.pollMs));
        if (closed) break;
        run = await read();
        if (!run) { send('run_failed', { run_id: String(runId), error: 'The run is no longer visible.' }); break; }
      }
    } catch (e) {
      console.error('[RunStream]', e);
      send('run_failed', { run_id: String(runId), error: 'The stream stopped reading the run — reconnect to continue.' });
    }
    if (!closed) res.end();
  });

  return router;
}
