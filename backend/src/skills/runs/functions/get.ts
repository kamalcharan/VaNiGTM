import { SkillContext } from '../../../types/skill.types';
import { actorOf, humanDuration } from './list';

export async function get(params: Record<string, unknown>, ctx: SkillContext) {
  const runId = String(params.run_id ?? '').trim();
  if (!/^\d+$/.test(runId)) {
    return { run: null, steps: [], changed: { count: 0, nodes: [] }, event: null, reason: 'NOT_FOUND', detail: 'run_id must be a run number' };
  }

  const r = await ctx.db.query<{
    id: string; agent_name: string; status: string; started_at: string | null; completed_at: string | null;
    duration_ms: number | null; created_at: string; steps: unknown[]; awaiting_input: Record<string, unknown> | null;
    checkpoint: Record<string, unknown> | null; last_checkpoint: string | null; output: unknown;
    error_trace: string | null; token_usage: unknown; inputs: Record<string, unknown> | null;
    event_id: string | null; event_type: string | null; source_type: string | null; event_status: string | null;
    attempts: number | null; event_error: string | null;
  }>(
    `SELECT r.id::text, r.agent_name, r.status, r.started_at, r.completed_at, r.duration_ms, r.created_at,
            COALESCE(r.steps, '[]'::jsonb) AS steps, r.awaiting_input, r.checkpoint, r.last_checkpoint,
            r.output, r.error_trace, r.token_usage, r.inputs,
            e.id::text AS event_id, e.event_type, e.source_type, e.status AS event_status, e.attempts, e.error AS event_error
       FROM gt_agent_runs r
       LEFT JOIN gt_events e ON e.id = r.event_id
      WHERE r.tenant_id = $tenant_id AND r.id = $run_id::bigint`,
    { tenant_id: ctx.tenant_id, run_id: runId },
  );
  const row = r.rows[0];
  if (!row) {
    // Same answer for "another tenant's run" and "no such run" — never confirm existence across tenants.
    return { run: null, steps: [], changed: { count: 0, nodes: [] }, event: null, reason: 'NOT_FOUND', detail: 'No such run in this workspace' };
  }

  // What this run wrote into the Brain. source_run_id is replaced on each
  // upsert, so this is "nodes this run last touched", which is the honest
  // reading of the column.
  const changed = await ctx.db.query<{ label: string; name: string; updated_at: string }>(
    `SELECT label, name, updated_at FROM gt_kg_nodes
      WHERE tenant_id = $tenant_id AND source_run_id = $run_id::bigint
      ORDER BY label, name LIMIT 100`,
    { tenant_id: ctx.tenant_id, run_id: runId },
  );
  const changedCount = await ctx.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gt_kg_nodes WHERE tenant_id = $tenant_id AND source_run_id = $run_id::bigint`,
    { tenant_id: ctx.tenant_id, run_id: runId },
  );

  const firstLine = (t: string | null) => (t ? t.split('\n')[0].slice(0, 300) : null);

  return {
    run: {
      id: row.id,
      agent: row.agent_name,
      status: row.status,
      trigger: row.event_type ?? row.agent_name,
      actor: actorOf(row.source_type),
      started_at: row.started_at ?? row.created_at,
      completed_at: row.completed_at,
      duration: humanDuration(row.duration_ms),
      duration_ms: row.duration_ms,
      awaiting_input: row.awaiting_input,
      checkpoint_keys: row.checkpoint ? Object.keys(row.checkpoint) : [],
      last_checkpoint: row.last_checkpoint,
      output: row.output,
      token_usage: row.token_usage,
      inputs: row.inputs,
      error: firstLine(row.error_trace),
      // The full trace names files and lines. Admins of the platform tenant get it; a tenant gets the first line.
      error_trace: ctx.is_admin ? row.error_trace : null,
    },
    steps: row.steps,
    changed: { count: changedCount.rows[0]?.n ?? 0, nodes: changed.rows },
    event: row.event_id ? {
      id: row.event_id, type: row.event_type, source_type: row.source_type,
      status: row.event_status, attempts: row.attempts, error: firstLine(row.event_error),
    } : null,
  };
}
