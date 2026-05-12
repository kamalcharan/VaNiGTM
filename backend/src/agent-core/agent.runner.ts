/**
 * Vikuna Agent Core — Agent Runner
 *
 * Manages the lifecycle of a gt_agent_runs row.
 *
 *   queued     → setStatus(running) when the worker picks the run
 *   running    → appendStep(...) for each logical step
 *   awaiting   → setStatus(awaiting, { awaiting_input }) when waiting on a human
 *   completed  → setStatus(completed, { output })
 *   failed     → setStatus(failed, { error_trace })
 *
 * gt_agent_runs.id is BIGSERIAL — runIds come back as numeric strings
 * (node-pg stringifies BIGINT). All helpers accept string | number.
 *
 * RLS note: the worker is cross-tenant, so these helpers use the pool
 * directly (no createTenantDb). Tenant scoping is enforced by writing
 * tenant_id explicitly on insert.
 */

import type { Pool } from 'pg';

export type AgentStatus =
  | 'queued'
  | 'running'
  | 'awaiting'
  | 'completed'
  | 'failed';

export interface AgentStep {
  ts: string;
  step_name: string;
  action: string;
  input_summary?: string;
  output_summary?: string;
  duration_ms?: number;
  status: 'ok' | 'error' | 'skipped';
}

export interface AgentRun {
  id: string;
  tenant_id: string;
  event_id: string | null;
  agent_name: string;
  status: AgentStatus | string;
  steps: AgentStep[];
  awaiting_input: Record<string, unknown> | null;
  retry_count: number;
  last_checkpoint: string | null;
  output: Record<string, unknown> | null;
  error_trace: string | null;
  token_usage: Record<string, unknown> | null;
  duration_ms: number | null;
  started_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

interface StatusExtras {
  awaiting_input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error_trace?: string;
  token_usage?: Record<string, unknown>;
  last_checkpoint?: string;
}

/* ── Create ──────────────────────────────────────────────────────────────── */

/**
 * Insert a new gt_agent_runs row in 'queued' state.
 * Returns the new run id (BIGSERIAL → string).
 */
export async function createRun(
  pool: Pool,
  tenantId: string,
  agentName: string,
  eventId?: string,
): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO gt_agent_runs (tenant_id, agent_name, event_id, status)
     VALUES ($1, $2, $3, 'queued')
     RETURNING id`,
    [tenantId, agentName, eventId ?? null],
  );
  return String(result.rows[0].id);
}

/* ── Status transitions ─────────────────────────────────────────────────── */

/**
 * Transition a run to a new status and optionally write extras.
 *
 *   running    → sets started_at = now()
 *   completed  → sets completed_at = now() + duration_ms
 *   failed     → sets completed_at = now() + duration_ms
 *
 * Extras (awaiting_input, output, error_trace, token_usage, last_checkpoint)
 * are written when provided. JSONB fields are stringified once.
 */
export async function setStatus(
  pool: Pool,
  runId: string | number,
  status: AgentStatus,
  extras: StatusExtras = {},
): Promise<void> {
  const setClauses: string[] = ['status = $2'];
  const values: unknown[] = [runId, status];
  let i = 3;

  if (status === 'running') {
    setClauses.push('started_at = now()');
  }
  if (status === 'completed' || status === 'failed') {
    setClauses.push('completed_at = now()');
    setClauses.push(
      `duration_ms = COALESCE(duration_ms, EXTRACT(EPOCH FROM (now() - started_at))::int * 1000)`,
    );
  }

  if (extras.awaiting_input !== undefined) {
    setClauses.push(`awaiting_input = $${i++}::jsonb`);
    values.push(JSON.stringify(extras.awaiting_input));
  }
  if (extras.output !== undefined) {
    setClauses.push(`output = $${i++}::jsonb`);
    values.push(JSON.stringify(extras.output));
  }
  if (extras.error_trace !== undefined) {
    setClauses.push(`error_trace = $${i++}`);
    values.push(extras.error_trace);
  }
  if (extras.token_usage !== undefined) {
    setClauses.push(`token_usage = $${i++}::jsonb`);
    values.push(JSON.stringify(extras.token_usage));
  }
  if (extras.last_checkpoint !== undefined) {
    setClauses.push(`last_checkpoint = $${i++}`);
    values.push(extras.last_checkpoint);
  }

  await pool.query(
    `UPDATE gt_agent_runs SET ${setClauses.join(', ')} WHERE id = $1`,
    values,
  );
}

/* ── Step log ───────────────────────────────────────────────────────────── */

/**
 * Append a step to the JSONB array `steps` on a run.
 * Timestamp is auto-injected as ISO 8601 (UTC).
 */
export async function appendStep(
  pool: Pool,
  runId: string | number,
  step: Omit<AgentStep, 'ts'>,
): Promise<void> {
  const fullStep: AgentStep = { ...step, ts: new Date().toISOString() };
  await pool.query(
    `UPDATE gt_agent_runs
        SET steps = steps || $1::jsonb
      WHERE id = $2`,
    [JSON.stringify([fullStep]), runId],
  );
}

/* ── Reads ──────────────────────────────────────────────────────────────── */

/**
 * Get a single run by id. Returns null when not found.
 */
export async function getRun(
  pool: Pool,
  runId: string | number,
): Promise<AgentRun | null> {
  const result = await pool.query<AgentRun>(
    `SELECT id::text, tenant_id, event_id, agent_name, status, steps,
            awaiting_input, retry_count, last_checkpoint, output,
            error_trace, token_usage, duration_ms,
            started_at, completed_at, created_at
       FROM gt_agent_runs
      WHERE id = $1`,
    [runId],
  );
  return result.rows[0] ?? null;
}

/**
 * List runs for a tenant, optionally filtered by agent_name.
 * Most-recent first.
 */
export async function getRuns(
  pool: Pool,
  tenantId: string,
  agentName?: string,
  limit = 20,
): Promise<AgentRun[]> {
  const result = await pool.query<AgentRun>(
    `SELECT id::text, tenant_id, event_id, agent_name, status, steps,
            awaiting_input, retry_count, last_checkpoint,
            token_usage, duration_ms, started_at, completed_at, created_at
       FROM gt_agent_runs
      WHERE tenant_id = $1
        AND ($2::text IS NULL OR agent_name = $2)
      ORDER BY created_at DESC
      LIMIT $3`,
    [tenantId, agentName ?? null, limit],
  );
  return result.rows;
}
