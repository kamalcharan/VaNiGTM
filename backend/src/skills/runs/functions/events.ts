import { SkillContext } from '../../../types/skill.types';
import { isHandledEvent } from '../../../agent-core/handled-events';

const STATUSES = ['pending', 'processing', 'done', 'failed'];

export async function events(params: Record<string, unknown>, ctx: SkillContext) {
  const limit = Math.min(500, Math.max(1, Number(params.limit) || 100));
  const status = typeof params.status === 'string' && STATUSES.includes(params.status) ? params.status : null;

  const r = await ctx.db.query<{
    id: string; event_type: string; source_type: string; status: string; attempts: number | null;
    created_at: string; started_at: string | null; processed_at: string | null; error: string | null;
    age_seconds: number; run_id: string | null; run_status: string | null;
  }>(
    `SELECT e.id::text, e.event_type, e.source_type, e.status, e.attempts, e.created_at, e.started_at, e.processed_at,
            e.error, EXTRACT(EPOCH FROM (now() - e.created_at))::int AS age_seconds,
            r.id::text AS run_id, r.status AS run_status
       FROM gt_events e
       LEFT JOIN gt_agent_runs r ON r.event_id = e.id
      WHERE e.tenant_id = $tenant_id
        ${status ? 'AND e.status = $status' : ''}
      ORDER BY e.created_at DESC
      LIMIT $limit`,
    status ? { tenant_id: ctx.tenant_id, status, limit } : { tenant_id: ctx.tenant_id, limit },
  );

  const counts = await ctx.db.query<{ status: string; n: number }>(
    `SELECT status, count(*)::int AS n FROM gt_events WHERE tenant_id = $tenant_id GROUP BY status`,
    { tenant_id: ctx.tenant_id },
  );

  const rows = r.rows.map((e) => ({
    ...e,
    error: e.error ? e.error.split('\n')[0].slice(0, 300) : null,
    handled: isHandledEvent(e.event_type),
    consumed: e.run_id !== null,
  }));

  return {
    events: rows,
    // Emitted, resolved, and nothing ran: the worker used to mark these done
    // and move on. They are listed so a person can see that the profile
    // crossed the line and no agent picked it up.
    unconsumed: rows.filter((e) => !e.handled),
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.rows.find((c) => c.status === s)?.n ?? 0])),
  };
}
