import { SkillContext } from '../../../types/skill.types';
import { HANDLED_EVENT_TYPES } from '../../../agent-core/handled-events';

export async function counters(_params: Record<string, unknown>, ctx: SkillContext) {
  // Agents live for this tenant. The vani_ spine keys on its own tenant id,
  // bridged by slug; a tenant who has not finished the Domain step has no
  // vani_tenant row and therefore zero live agents, which is the truth.
  const agents = await ctx.db.query<{ n: number }>(
    `SELECT count(*)::int AS n
       FROM vani_tenant_agent ta
       JOIN vani_tenant vt ON vt.id = ta.tenant_id
       JOIN vn_tenants t ON t.slug = vt.slug
      WHERE t.id = $tenant_id AND ta.status = 'live'`,
    { tenant_id: ctx.tenant_id },
  );
  const runs = await ctx.db.query<{ today: number; awaiting: number; failed_24h: number }>(
    `SELECT count(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today,
            count(*) FILTER (WHERE status = 'awaiting')::int AS awaiting,
            count(*) FILTER (WHERE status = 'failed' AND created_at >= now() - interval '24 hours')::int AS failed_24h
       FROM gt_agent_runs WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );
  const unconsumed = await ctx.db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM gt_events
      WHERE tenant_id = $tenant_id AND NOT (event_type = ANY($handled::text[]))`,
    { tenant_id: ctx.tenant_id, handled: [...HANDLED_EVENT_TYPES] },
  );
  const r = runs.rows[0];
  return {
    agents_active: agents.rows[0]?.n ?? 0,
    runs_today: r?.today ?? 0,
    handovers: r?.awaiting ?? 0,
    attention: (r?.failed_24h ?? 0) + (unconsumed.rows[0]?.n ?? 0),
    detail: { failed_24h: r?.failed_24h ?? 0, unconsumed_events: unconsumed.rows[0]?.n ?? 0 },
  };
}
