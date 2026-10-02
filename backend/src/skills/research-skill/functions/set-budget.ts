/**
 * research-skill: set_budget
 *
 * Set this tenant's OWN daily token limit — LOWER than the platform's — or go
 * back to the platform's.
 *
 * ── RELEASE 3 (D-Q12, Charan 2026-10-02) CHANGED WHAT THIS MEANS ──────────
 *
 * Migration 217 had made "no cap" the default, because a 100,000 cap sized for
 * chat agents had silently meant "seven companies" of research. D-Q12 brings a
 * cap back DELIBERATELY: TENANT_DAILY_TOKEN_LIMIT a day and
 * TENANT_MONTHLY_TOKEN_LIMIT a month from .env, for every platform tenant, and
 * "the daily limit never rises" — more work is paid for with a TOP-UP, which
 * is spent after the base (Settings → Tokens, admin).
 *
 * So a tenant may only tighten its own limit here, never raise it past the
 * platform's, and empty means "the platform's limit", not "no cap". Usage is
 * metered either way.
 */

import { SkillContext } from '../../../shared/types';

import { readBudgetConfig } from '../../../agent-core/token.budget';

/** Below this nothing meaningful runs. */
const MIN_LIMIT = 10_000;

interface SetBudgetParams {
  /** A lower daily limit for this tenant, or null / 0 for the platform's. */
  daily_token_limit: number | null;
}

export async function set_budget(params: SetBudgetParams, ctx: SkillContext) {
  const raw = params.daily_token_limit;

  // null, 0 and '' all mean "the platform's limit".
  const platform = readBudgetConfig().dailyLimit;
  const clearing = raw === null || raw === undefined || Number(raw) === 0
    || String(raw).trim() === '';

  let limit: number | null = null;
  if (!clearing) {
    limit = Math.floor(Number(raw));
    if (!Number.isFinite(limit) || limit < MIN_LIMIT || limit > platform) {
      throw new Error(
        `Your own daily limit must be between ${MIN_LIMIT.toLocaleString('en-US')} and the platform's `
        + `${platform.toLocaleString('en-US')} tokens, or empty for the platform's. The daily limit does not rise — `
        + 'for more work, an admin adds a top-up, which is spent after the day\'s limit. Account research costs '
        + 'roughly 14,000 tokens per company.',
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

    // No row yet: no model call has been recorded for this tenant. Nothing
    // was changed — the platform's limit applies until a row exists.
    if (res.rows.length === 0) {
      throw new Error(
        'Nothing has been spent in this workspace yet, so there is no limit to change — '
        + `the platform's ${platform.toLocaleString('en-US')} tokens a day applies. Nothing was changed.`,
      );
    }

    return {
      daily_token_limit: res.rows[0].daily_token_limit,
      capped: true,
      message: clearing
        ? `Back to the platform's ${platform.toLocaleString('en-US')} tokens a day.`
        : `Your own limit: ${limit!.toLocaleString('en-US')} tokens a day — about `
          + `${Math.floor(limit! / 14_000)} companies of research.`,
      recipe: 'budget-card' as const,
    };
  });
}
