import { SkillContext } from '../../../types/skill.types';

/**
 * One queue for everything parked on a person. `awaiting_input` has grown
 * two shapes — `{type:'input', prompt, context}` from the VaNi conversation
 * and `{kind:'llm_failover_approval', question, ...}` from the failover gate —
 * so `kind` and `question` are read from whichever is present. The failover
 * queue keeps its own, richer reader (`llm-provider-skill.pending_failovers`,
 * which judges supersession); this one is the overview.
 */
export async function awaiting(_params: Record<string, unknown>, ctx: SkillContext) {
  const r = await ctx.db.query<{
    run_id: string; agent_name: string; awaiting_input: Record<string, unknown> | null;
    asked_at: string; event_id: string | null; event_type: string | null;
  }>(
    `SELECT r.id::text AS run_id, r.agent_name, r.awaiting_input,
            COALESCE(r.started_at, r.created_at) AS asked_at,
            e.id::text AS event_id, e.event_type
       FROM gt_agent_runs r
       LEFT JOIN gt_events e ON e.id = r.event_id
      WHERE r.tenant_id = $tenant_id AND r.status = 'awaiting'
      ORDER BY COALESCE(r.started_at, r.created_at) DESC
      LIMIT 200`,
    { tenant_id: ctx.tenant_id },
  );
  return {
    items: r.rows.map((row) => {
      const a = row.awaiting_input ?? {};
      return {
        run_id: row.run_id,
        agent: row.agent_name,
        kind: String(a.kind ?? a.type ?? 'input'),
        question: (a.question ?? a.prompt ?? null) as string | null,
        asked_at: row.asked_at,
        event_id: row.event_id,
        event_type: row.event_type,
      };
    }),
  };
}
