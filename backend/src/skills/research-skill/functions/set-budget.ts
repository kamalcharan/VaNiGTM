/**
 * research-skill: set_budget
 *
 * Set — or remove — the daily token cap for THIS tenant.
 *
 * ── NO CAP IS THE DEFAULT ─────────────────────────────────────────────
 *
 * Migration 217 made `daily_token_limit` nullable and cleared every tenant
 * still sitting on the framework's old 100,000. That number was sized for a
 * conversational agent; account research costs ~14,000 tokens per company, so
 * it silently meant "seven companies" and the first real batch died at eight
 * against a limit nobody had ever chosen.
 *
 * A cap applied to every tenant by default is a product-level restriction
 * wearing a per-tenant column. Whoever runs a tenant decides what it may
 * spend, and if they decide nothing, the answer is no cap — not a guess made
 * by whoever wrote the schema.
 *
 * Usage stays metered either way. Metering and capping are different things
 * and only one of them was the problem.
 */

import { SkillContext } from '../../../shared/types';

/** Below this nothing meaningful runs; above it, a runaway is expensive. */
const MIN_LIMIT = 10_000;
const MAX_LIMIT = 100_000_000;

interface SetBudgetParams {
  /** A number to cap this tenant, or null / 0 to remove the cap. */
  daily_token_limit: number | null;
}

export async function set_budget(params: SetBudgetParams, ctx: SkillContext) {
  const raw = params.daily_token_limit;

  // null, 0 and '' all mean the same obvious thing. Being fussy here would
  // only mean an operator who wants no cap has to guess the magic value.
  const clearing = raw === null || raw === undefined || Number(raw) === 0
    || String(raw).trim() === '';

  let limit: number | null = null;
  if (!clearing) {
    limit = Math.floor(Number(raw));
    if (!Number.isFinite(limit) || limit < MIN_LIMIT || limit > MAX_LIMIT) {
      throw new Error(
        `A cap must be between ${MIN_LIMIT.toLocaleString()} and `
        + `${MAX_LIMIT.toLocaleString()} tokens, or empty for no cap. Account `
        + 'research costs roughly 14,000 tokens per company, so 1.5 million '
        + 'covers a hundred of them.',
      );
    }
  }

  return ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ daily_token_limit: number | null }>(
      `UPDATE gt_tenant_context
          SET daily_token_limit = $limit, updated_at = now()
        WHERE tenant_id = $tenant_id
        RETURNING daily_token_limit`,
      { limit, tenant_id: ctx.tenant_id },
    );

    // No row means nothing is tracked for this tenant at all — and with no
    // row there is also no cap, so "removed it" would be true by accident and
    // "saved it" would be a lie the next batch exposes.
    if (res.rows.length === 0) {
      throw new Error(
        'This tenant has no agent context row, so nothing is being counted and '
        + 'nothing is capped. Nothing was changed — an agent has to run once '
        + 'before there is a budget to configure.',
      );
    }

    return {
      daily_token_limit: res.rows[0].daily_token_limit,
      capped: res.rows[0].daily_token_limit !== null,
      message: clearing
        ? 'Cap removed. This tenant can now spend whatever it needs; usage is '
          + 'still counted so you can see what a batch costs.'
        : `Capped at ${limit!.toLocaleString()} tokens a day — about `
          + `${Math.floor(limit! / 14_000)} companies.`,
      recipe: 'budget-card' as const,
    };
  });
}
