/**
 * research-skill: get_budget
 *
 * What today's token budget can pay for, in companies.
 *
 * A budget you can only discover by crashing into it is not a budget, it is a
 * trap — the pilot queued a hundred companies against a limit that covered
 * seven and found out at company eight. Tokens are also the wrong unit for
 * the person pressing the button; companies are the unit they think in, so
 * the conversion happens here rather than in their head.
 */

import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db/pool';
import { getTokenBudget } from '../../../agent-core/llm.client';
import { COST_FULL_RESEARCH, COST_RESCORE_ONLY } from '../account.agent';

export async function get_budget(
  _params: Record<string, unknown>,
  ctx: SkillContext,
) {
  const b = await getTokenBudget(getPool(), ctx.tenant_id);

  return {
    limit: b.unmetered ? null : b.limit,
    used: b.unmetered ? null : b.used,
    remaining: b.unmetered ? null : b.remaining,
    unmetered: b.unmetered,
    // What the numbers MEAN, computed once here so the screen and the agent
    // cannot drift apart on the arithmetic.
    cost_per_company: COST_FULL_RESEARCH,
    cost_per_rescore: COST_RESCORE_ONLY,
    affordable_companies: b.unmetered
      ? null
      : Math.floor(b.remaining / COST_FULL_RESEARCH),
    affordable_rescores: b.unmetered
      ? null
      : Math.floor(b.remaining / COST_RESCORE_ONLY),
    recipe: 'budget-card' as const,
  };
}
