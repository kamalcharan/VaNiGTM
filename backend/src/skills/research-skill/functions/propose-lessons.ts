/**
 * research-skill: propose_lessons
 *
 * Ask the agent what it has learned from your decisions.
 *
 * Queued for the worker rather than run here: it is an LLM call over the whole
 * decision history, which is not something an HTTP request should hold open.
 * The screen polls `get_lessons` and the proposals appear.
 *
 * The floor is enforced HERE as well as in the agent, so the refusal is
 * immediate and readable instead of arriving as a completed run that
 * proposed nothing.
 */

import { SkillContext } from '../../../shared/types';
import { emitEvent } from '../../../agent-core/event.store';
import { getPool } from '../../../db/pool';
import { MIN_DECISIONS } from '../lesson.agent';

export async function propose_lessons(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const res = await ctx.db.query<{ decisions: string }>(
    `SELECT count(*)::text AS decisions
       FROM gt_account_briefs
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND decided_at IS NOT NULL
        AND status NOT IN ('unreadable','extract_failed')`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );
  const decisions = Number(res.rows[0]?.decisions ?? 0);

  if (decisions < MIN_DECISIONS) {
    throw new Error(
      `Only ${decisions} decision${decisions === 1 ? '' : 's'} so far. `
      + `Rules are inferred from ${MIN_DECISIONS} or more — below that a "rule" `
      + 'is just a description of a handful of companies, and it would go on to '
      + 'decide who gets contacted. Approve or rule out a few more briefs first.',
    );
  }

  const eventId = await emitEvent(
    getPool(), ctx.tenant_id, 'FIT_LESSONS_REQUESTED', 'human',
    { is_live: ctx.is_live },
  );

  return {
    event_id: eventId,
    decisions,
    recipe: 'lessons-queued' as const,
  };
}
