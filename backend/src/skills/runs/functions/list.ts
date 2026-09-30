import { SkillContext } from '../../../types/skill.types';

export type RunStatus = 'queued' | 'running' | 'awaiting' | 'completed' | 'failed';
const STATUSES: RunStatus[] = ['queued', 'running', 'awaiting', 'completed', 'failed'];

/** gt_events.source_type → the console's actor vocabulary. */
export function actorOf(sourceType: string | null): 'human' | 'rule' | 'timer' | 'system' {
  if (sourceType === 'human') return 'human';
  if (sourceType === 'cron') return 'timer';
  return 'system';
}

export function humanDuration(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

export async function list(params: Record<string, unknown>, ctx: SkillContext) {
  const limit = Math.min(200, Math.max(1, Number(params.limit) || 50));
  const status = typeof params.status === 'string' && STATUSES.includes(params.status as RunStatus)
    ? (params.status as RunStatus) : null;

  const r = await ctx.db.query<{
    id: string; agent_name: string; status: RunStatus; started_at: string | null;
    completed_at: string | null; duration_ms: number | null; created_at: string;
    steps: number; awaiting: boolean; event_type: string | null; source_type: string | null;
  }>(
    `SELECT r.id::text, r.agent_name, r.status, r.started_at, r.completed_at, r.duration_ms, r.created_at,
            jsonb_array_length(COALESCE(r.steps, '[]'::jsonb)) AS steps,
            (r.awaiting_input IS NOT NULL) AS awaiting,
            e.event_type, e.source_type
       FROM gt_agent_runs r
       LEFT JOIN gt_events e ON e.id = r.event_id
      WHERE r.tenant_id = $tenant_id
        ${status ? 'AND r.status = $status' : ''}
      ORDER BY r.created_at DESC
      LIMIT $limit`,
    status ? { tenant_id: ctx.tenant_id, status, limit } : { tenant_id: ctx.tenant_id, limit },
  );

  return {
    runs: r.rows.map((row) => ({
      id: row.id,
      agent: row.agent_name,
      trigger: row.event_type ?? row.agent_name,
      actor: actorOf(row.source_type),
      started: row.started_at ?? row.created_at,
      started_at: row.started_at ?? row.created_at,
      duration: humanDuration(row.duration_ms),
      duration_ms: row.duration_ms,
      steps: row.steps,
      status: row.status,
      awaiting: row.awaiting,
      event_type: row.event_type,
    })),
  };
}
