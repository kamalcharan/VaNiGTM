/** tenant: tokens — the budget now, the last 30 days, and the top-up ledger. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { withTenantClient } from '../../../db';
import { getTokenBudget } from '../../../agent-core/token.budget';

export async function tokens(_params: Record<string, unknown>, ctx: SkillContext) {
  const pool = getPool();
  const b = await getTokenBudget(pool, ctx.tenant_id);
  const { days, ledger } = await withTenantClient(pool, ctx.tenant_id, async (c) => {
    const u = (await c.query(`SELECT daily_token_usage FROM gt_tenant_context WHERE tenant_id = $1`, [ctx.tenant_id])).rows[0];
    const usage = (u?.daily_token_usage ?? {}) as Record<string, { vps?: number; escalation?: number }>;
    const since = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
    const days = Object.entries(usage).filter(([d]) => d >= since).sort(([a], [b2]) => (a < b2 ? 1 : -1))
      .map(([day, v]) => ({ day, tokens: (v.vps ?? 0) + (v.escalation ?? 0) }));
    const ledger = (await c.query(
      `SELECT t.tokens, t.reason, t.created_at, t.run_id,
              NULLIF(trim(concat_ws(' ', u.first_name, u.last_name)), '') AS by_name
         FROM gt_token_topups t LEFT JOIN vn_users u ON u.id = t.added_by
        WHERE t.tenant_id = $1 ORDER BY t.created_at DESC, t.id DESC LIMIT 50`, [ctx.tenant_id])).rows
      .map((r: any) => ({ ...r, tokens: Number(r.tokens) }));
    return { days, ledger };
  });
  return {
    budget: {
      capped: b.capped, daily_limit: b.limit, used_today: b.used, monthly_limit: b.monthly_limit,
      used_this_month: b.month_used, topup_balance: Math.max(0, b.topup_balance),
      remaining: b.capped ? b.remaining : null, daily_source: b.daily_source, monthly_source: b.monthly_source,
    },
    days, ledger,
  };
}
