/**
 * Runs stopped because the platform model did not answer.
 *
 * Only reachable with `HAIKU_DEFAULT=false`. With it true the escalation
 * happens on its own and this list is always empty — which is the point of
 * the flag: seven runs failed over inside a minute on 2026-09-18 and the only
 * place that showed was the worker's stdout, while Vikuna was billed for every
 * one of those calls.
 */

import { SkillContext } from '../../../shared/types';

export async function pending_failovers(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const r = await ctx.db.query<{
    id: string; agent_name: string; started_at: string; awaiting_input: Record<string, any>;
  }>(
    `SELECT id, agent_name, started_at, awaiting_input
       FROM gt_agent_runs
      WHERE tenant_id = $tenant_id
        AND status = 'awaiting'
        AND awaiting_input ->> 'kind' = 'llm_failover_approval'
      ORDER BY started_at DESC
      LIMIT 50`,
    { tenant_id: ctx.tenant_id },
  );

  const runs = r.rows.map((x) => ({
    run_id: String(x.id),
    agent: x.agent_name,
    asked_at: x.started_at,
    failover_model: x.awaiting_input?.failover_model ?? null,
    // The server's own words, never a paraphrase. "Cannot reach" and "context
    // size exceeded" are different outages and lead to different fixes.
    vps_error: x.awaiting_input?.vps_error ?? null,
    question: x.awaiting_input?.question ?? null,
  }));

  return {
    runs,
    // Rule 9b: an empty list still says what it means, and the two reasons it
    // can be empty are not the same.
    detail: runs.length
      ? `${runs.length} run${runs.length === 1 ? '' : 's'} waiting on a decision.`
      : 'Nothing waiting. Either the platform model is answering, or HAIKU_DEFAULT is true and escalation is automatic.',
  };
}
