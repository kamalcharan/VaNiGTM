/**
 * research-skill: get_touches
 *
 * What was sent, and what came back — for one company or across the pilot.
 *
 * `is_pending` is computed here rather than left to the caller, so the
 * dossier, the scoreboard and any future screen agree on when silence starts
 * counting as an answer.
 */

import { SkillContext } from '../../../shared/types';
import { RESPONSE_WINDOW_DAYS } from '../touches';

interface GetTouchesParams {
  prospect_id?: number;
  limit?: number;
}

export async function get_touches(params: GetTouchesParams, ctx: SkillContext) {
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  const prospectId = Number(params.prospect_id);

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT t.id, t.prospect_id, p.ref, p.name AS company,
            t.offer, t.channel, t.touched_at, t.outcome, t.outcome_at,
            t.notes, t.had_brief,
            -- Still inside the window with no answer: neither a reply nor a
            -- non-reply, and the scoreboard excludes it from the rate.
            (t.outcome IS NULL
             AND t.touched_at >= now() - ($window::int || ' days')::interval)
                AS is_pending
       FROM gt_touch_log t
       JOIN gt_prospects p
             ON p.id = t.prospect_id
            AND p.tenant_id = $tenant_id
            AND p.is_live   = $is_live
      WHERE t.tenant_id = $tenant_id
        AND t.is_live   = $is_live
        AND ($prospect_id::bigint IS NULL OR t.prospect_id = $prospect_id::bigint)
      ORDER BY t.touched_at DESC, t.id DESC
      LIMIT $limit`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      prospect_id: Number.isFinite(prospectId) ? prospectId : null,
      window: RESPONSE_WINDOW_DAYS, limit,
    },
  );

  return { touches: res.rows, recipe: 'touch-list' as const };
}
