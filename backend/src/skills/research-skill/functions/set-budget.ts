/**
 * research-skill: set_budget
 *
 * Raise or lower the daily token limit.
 *
 * The default of 100,000 was set for conversational agents, where it is a
 * generous day. For account research it is about seven companies — a hundred
 * companies is roughly 1.4 million tokens — so the pilot hit the wall on its
 * first real batch and the limit looked like a bug.
 *
 * It is not a bug, and this is deliberately not auto-raised. The cap exists so
 * that a runaway agent costs a bounded amount, and a cap that quietly lifts
 * itself the moment it binds is not a cap. Raising it is one number and one
 * click — but it is a decision, and it stays one.
 */

import { SkillContext } from '../../../shared/types';

/** Below this, nothing meaningful runs; above it, a runaway is expensive. */
const MIN_LIMIT = 10_000;
const MAX_LIMIT = 20_000_000;

interface SetBudgetParams { daily_token_limit: number }

export async function set_budget(params: SetBudgetParams, ctx: SkillContext) {
  const limit = Math.floor(Number(params.daily_token_limit));

  if (!Number.isFinite(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
    throw new Error(
      `The daily limit must be between ${MIN_LIMIT.toLocaleString()} and `
      + `${MAX_LIMIT.toLocaleString()} tokens. Account research costs roughly `
      + '14,000 tokens per company, so 1.5 million covers a hundred of them.',
    );
  }

  return ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ daily_token_limit: number }>(
      `UPDATE gt_tenant_context
          SET daily_token_limit = $limit, updated_at = now()
        WHERE tenant_id = $tenant_id
        RETURNING daily_token_limit`,
      { limit, tenant_id: ctx.tenant_id },
    );

    // No row means nothing is being metered for this tenant at all. Saying
    // "saved" would be a lie the next batch would expose.
    if (res.rows.length === 0) {
      throw new Error(
        'This tenant has no agent context row, so no budget is being counted. '
        + 'Nothing was changed — an agent has to run once before there is a '
        + 'budget to raise.',
      );
    }

    return {
      daily_token_limit: res.rows[0].daily_token_limit,
      recipe: 'budget-card' as const,
    };
  });
}
