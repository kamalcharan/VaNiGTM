/**
 * research-skill: get_budget
 *
 * What today has cost, and what — if anything — is limiting it.
 *
 * ── TWO SEPARATE THINGS ───────────────────────────────────────────────
 *
 * `used` is always real. Every call is counted whether or not a cap exists,
 * because that number is how anyone finds out what a batch of a hundred
 * companies actually costs. Without it a cap gets picked by guessing, which
 * is exactly how a limit sized for chat agents came to mean "seven companies"
 * for account research.
 *
 * `limit` is null for most tenants, and that is the default (migration 217).
 * A cap exists only because somebody set one for that tenant.
 *
 * Tokens are also the wrong unit for the person pressing the button;
 * companies are the unit they think in, so the conversion happens here rather
 * than in their head.
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
    /** null = no cap for this tenant. */
    limit: b.limit,
    /** Always counted, cap or no cap. null only if nothing is tracked at all. */
    used: b.tracked ? b.used : null,
    remaining: b.capped ? b.remaining : null,
    capped: b.capped,
    tracked: b.tracked,
    // What the numbers MEAN, computed once here so the screen and the agent
    // cannot drift apart on the arithmetic.
    cost_per_company: COST_FULL_RESEARCH,
    cost_per_rescore: COST_RESCORE_ONLY,
    // null when uncapped — "how many can I afford" has no answer, which is
    // different from the answer being zero.
    affordable_companies: b.capped ? Math.floor(b.remaining / COST_FULL_RESEARCH) : null,
    affordable_rescores: b.capped ? Math.floor(b.remaining / COST_RESCORE_ONLY) : null,
    recipe: 'budget-card' as const,
  };
}
