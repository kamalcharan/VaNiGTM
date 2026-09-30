import { SkillContext } from '../../../types/skill.types';
import { HANDLED_EVENT_TYPES, isHandledEvent } from '../../../agent-core/handled-events';

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

  const rows = r.rows.map((e) => {
    const handled = isHandledEvent(e.event_type);
    return {
      ...e,
      error: e.error ? e.error.split('\n')[0].slice(0, 300) : null,
      handled,
      consumed: e.run_id !== null,
      // The worker only claims event types it can run (POA C6), so an event
      // nothing handles stays `pending` — not stuck, WAITING. Said in words,
      // so "pending" on screen cannot be read as a jammed queue.
      waiting_reason: !handled && e.status === 'pending'
        ? `No agent handles ${e.event_type} yet. It stays queued and runs when one is added.`
        : null,
    };
  });

  const waiting = await ctx.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gt_events
      WHERE tenant_id = $tenant_id AND status = 'pending'
        AND NOT (event_type = ANY($handled::text[]))`,
    { tenant_id: ctx.tenant_id, handled: [...HANDLED_EVENT_TYPES] },
  );

  return {
    events: rows,
    // Emitted and consumed by nothing. Since C6 these wait in `pending`; rows
    // from before it were resolved `done` by the old worker and still show
    // here, with no run. Either way a person can see that the profile crossed
    // the line and no agent picked it up.
    unconsumed: rows.filter((e) => !e.handled),
    counts: {
      ...Object.fromEntries(STATUSES.map((s) => [s, counts.rows.find((c) => c.status === s)?.n ?? 0])),
      // Included in `pending`, broken out so a screen can show "3 pending, all
      // waiting for an agent" instead of an alarming queue depth.
      waiting_for_agent: waiting.rows[0]?.n ?? 0,
    },
  };
}
