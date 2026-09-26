/**
 * Runs stopped because the platform model did not answer.
 *
 * Only reachable with `HAIKU_DEFAULT=false`. With it true the escalation
 * happens on its own and this list is always empty — which is the point of
 * the flag: seven runs failed over inside a minute on 2026-09-18 and the only
 * place that showed was the worker's stdout, while Vikuna was billed for every
 * one of those calls.
 *
 * Each run is joined back to the SOURCE its event was about, when it had one
 * (URL_SUBMITTED / FILE_UPLOADED carry `source_id`). A parked run whose source
 * has since been read successfully — the person clicked "Read again", or the
 * platform model came back — is SUPERSEDED: approving it would pay to redo
 * work that is already done. The queue says so, because on 2026-09-26 the
 * Knowledge page showed "vikuna.io · read · 103 entries" and, directly under
 * it, run 124 for the same page asking whether to spend money on it.
 */

import { SkillContext } from '../../../shared/types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PendingFailoverRun {
  run_id: string;
  agent: string;
  asked_at: string;
  failover_model: string | null;
  vps_error: string | null;
  question: string | null;
  /** The source this run was reading, when its event named one. */
  source: { id: string; name: string; status: string; updated_at: string } | null;
  /** True when that source completed AFTER this run parked — a later read did the work. */
  superseded: boolean;
  superseded_detail: string | null;
}

export async function pending_failovers(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const r = await ctx.db.query<{
    id: string; agent_name: string; started_at: string; awaiting_input: Record<string, any>;
    source_id: string | null; source_name: string | null; source_status: string | null; source_updated_at: Date | null;
    superseded: boolean | null;
  }>(
    // gt_events is the cross-tenant bus (RLS off by design) so the join
    // carries the tenant filter itself; gt_kb_sources is tenant-scoped and
    // gets the same. The uuid casts are guarded: a payload from another event
    // type may carry no source_id, or something that is not one.
    `SELECT r.id, r.agent_name, r.started_at, r.awaiting_input,
            s.id AS source_id, s.display_name AS source_name,
            s.status AS source_status, s.updated_at AS source_updated_at,
            (s.status = 'complete' AND s.updated_at > r.started_at) AS superseded
       FROM gt_agent_runs r
       LEFT JOIN gt_events e
         ON e.tenant_id = r.tenant_id
        AND (r.awaiting_input ->> 'event_id') ~* $uuid
        AND e.id = (r.awaiting_input ->> 'event_id')::uuid
       LEFT JOIN gt_kb_sources s
         ON s.tenant_id = r.tenant_id
        AND (e.payload ->> 'source_id') ~* $uuid
        AND s.id = (e.payload ->> 'source_id')::uuid
      WHERE r.tenant_id = $tenant_id
        AND r.status = 'awaiting'
        AND r.awaiting_input ->> 'kind' = 'llm_failover_approval'
      ORDER BY r.started_at DESC
      LIMIT 50`,
    { tenant_id: ctx.tenant_id, uuid: UUID.source },
  );

  const runs: PendingFailoverRun[] = r.rows.map((x) => {
    const source = x.source_id
      ? { id: String(x.source_id), name: x.source_name ?? '', status: x.source_status ?? '', updated_at: x.source_updated_at?.toISOString() ?? '' }
      : null;
    // Judged in SQL against the same clock that stamped both rows.
    const superseded = !!source && x.superseded === true;
    return {
      run_id: String(x.id),
      agent: x.agent_name,
      asked_at: x.started_at,
      failover_model: x.awaiting_input?.failover_model ?? null,
      // The server's own words, never a paraphrase. "Cannot reach" and "context
      // size exceeded" are different outages and lead to different fixes.
      vps_error: x.awaiting_input?.vps_error ?? null,
      question: x.awaiting_input?.question ?? null,
      source,
      superseded,
      superseded_detail: superseded
        ? `${source!.name} was read successfully after this run parked. Approving would pay to read it again; declining loses nothing.`
        : null,
    };
  });

  const stale = runs.filter((x) => x.superseded).length;
  return {
    runs,
    // Rule 9b: an empty list still says what it means, and the two reasons it
    // can be empty are not the same.
    detail: runs.length
      ? `${runs.length} run${runs.length === 1 ? '' : 's'} waiting on a decision.${stale ? ` ${stale} of them ${stale === 1 ? 'is' : 'are'} already done by a later read.` : ''}`
      : 'Nothing waiting. Either the platform model is answering, or HAIKU_DEFAULT is true and escalation is automatic.',
  };
}
