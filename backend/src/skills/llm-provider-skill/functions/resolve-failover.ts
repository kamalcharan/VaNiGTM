/**
 * Answer a parked run: escalate it, or let it go.
 *
 * APPROVING RE-EMITS THE ORIGINAL EVENT with `allow_failover: true` rather
 * than resuming the old run in place. Two reasons. The agents are built around
 * events and their claim/checkpoint logic already handles a re-run — resuming
 * a half-finished run would be a second, untested path through the same code.
 * And the new run is a separate row, so "this run cost Vikuna money because a
 * person said yes on the 18th" stays answerable afterwards.
 */

import { SkillContext } from '../../../shared/types';

export async function resolve_failover(
  params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const runId = String(params.run_id ?? '').trim();
  const approve = params.approve === true;
  if (!runId) {
    return { ok: false, reason: 'NO_RUN', detail: 'Which run?' };
  }

  const r = await ctx.db.query<{
    agent_name: string; awaiting_input: Record<string, any>;
  }>(
    `SELECT agent_name, awaiting_input
       FROM gt_agent_runs
      WHERE id = $run_id AND tenant_id = $tenant_id
        AND status = 'awaiting'
        AND awaiting_input ->> 'kind' = 'llm_failover_approval'`,
    { run_id: runId, tenant_id: ctx.tenant_id },
  );
  if (!r.rows.length) {
    // Tenant-scoped on purpose — another tenant's run is not found, not
    // forbidden, and the message is the same either way.
    return {
      ok: false, reason: 'NOT_WAITING',
      detail: `Run ${runId} is not waiting on a failover decision.`,
    };
  }
  const ask = r.rows[0].awaiting_input;

  return ctx.db.transaction(async (tx) => {
    if (!approve) {
      await tx.query(
        `UPDATE gt_agent_runs
            SET status = 'failed', completed_at = now(), awaiting_input = NULL,
                error_trace = $reason
          WHERE id = $run_id AND tenant_id = $tenant_id`,
        {
          run_id: runId, tenant_id: ctx.tenant_id,
          reason: `LLM_FAILOVER_DECLINED: ${ask.vps_error ?? 'platform model unreachable'}`,
        },
      );
      return {
        ok: true, approved: false,
        detail: 'Left it failed. Nothing was spent, and the cause is on the run.',
      };
    }

    // Same event type, same payload, plus the permission. The agent's claim
    // sees a fresh request and runs it normally.
    const ev = await tx.query<{ id: string }>(
      `INSERT INTO gt_events (tenant_id, event_type, source_type, payload)
       SELECT tenant_id, event_type, 'human',
              payload || jsonb_build_object('allow_failover', true)
         FROM gt_events WHERE id = $event_id
       RETURNING id`,
      { event_id: String(ask.event_id) },
    );
    if (!ev.rows.length) {
      throw new Error(`LLM_FAILOVER_EVENT_GONE: cannot find event ${ask.event_id} to retry`);
    }

    await tx.query(
      `UPDATE gt_agent_runs
          SET status = 'completed', completed_at = now(), awaiting_input = NULL,
              output = COALESCE(output, '{}'::jsonb)
                       || jsonb_build_object('failover_approved_by', $user_id::text,
                                             'retried_as_event', $event_id::text)
        WHERE id = $run_id AND tenant_id = $tenant_id`,
      {
        run_id: runId, tenant_id: ctx.tenant_id,
        user_id: ctx.user_id ?? 'unknown', event_id: ev.rows[0].id,
      },
    );

    return {
      ok: true, approved: true, event_id: String(ev.rows[0].id),
      detail: `Retrying on ${ask.failover_model ?? 'the failover model'}. `
        + 'Vikuna is billed for this run; it shows in the escalation bucket.',
    };
  });
}
