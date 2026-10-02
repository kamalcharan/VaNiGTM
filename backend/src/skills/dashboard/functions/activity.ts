import { SkillContext } from '../../../types/skill.types';
import { agentOf } from '../../../agent-core/agent-names';

export async function activity(params: Record<string, unknown>, ctx: SkillContext) {
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const r = await ctx.db.query<{
    id: string; agent_name: string; status: string; at: string; event_type: string | null;
    last_step: { step_name?: string; action?: string; output_summary?: string; status?: string } | null;
  }>(
    `SELECT r.id::text, r.agent_name, r.status, COALESCE(r.completed_at, r.started_at, r.created_at) AS at,
            e.event_type,
            CASE WHEN jsonb_array_length(COALESCE(r.steps,'[]'::jsonb)) > 0
                 THEN r.steps -> (jsonb_array_length(r.steps) - 1) END AS last_step
       FROM gt_agent_runs r
       LEFT JOIN gt_events e ON e.id = r.event_id
      WHERE r.tenant_id = $tenant_id
      ORDER BY COALESCE(r.completed_at, r.started_at, r.created_at) DESC
      LIMIT $limit`,
    { tenant_id: ctx.tenant_id, limit },
  );
  return {
    activity: r.rows.map((row) => {
      const step = row.last_step ?? {};
      const said = step.output_summary || step.action || step.step_name || null;
      const text = row.status === 'awaiting' ? `waiting on you${said ? ` — ${said}` : ''}`
        : row.status === 'failed' ? `failed${said ? ` at ${step.step_name ?? said}` : ''}`
        : row.status === 'running' ? `running${said ? ` — ${said}` : ''}`
        : said ?? row.status;
      return { id: `run-${row.id}`, at: row.at, agent: agentOf(row.event_type ?? row.agent_name), text, run: row.id };
    }),
  };
}
