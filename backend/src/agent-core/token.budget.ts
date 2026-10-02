/**
 * A tenant's token budget — D-Q12 (Charan, 2026-10-02), S18 (migration 274).
 *
 *   "for a tenant it will be 100,000 tokens a day … there will be a monthly cap
 *    as well … it won't raise daily limit, daily limit is 100000 only and
 *    whatever credit is available is consumed from topup."
 *
 *   base      TENANT_DAILY_TOKEN_LIMIT a UTC day and TENANT_MONTHLY_TOKEN_LIMIT a
 *             UTC calendar month, from .env — or the tenant's own row in
 *             gt_tenant_context (daily_token_limit / monthly_token_limit) when
 *             an admin set one. The base never rises.
 *   top-up    gt_token_topups, a ledger: + rows an admin added, − rows drawn.
 *             Once the day's or the month's base is used, calls draw from it.
 *   stop      both spent → the call is refused BEFORE anything is sent, with
 *             the numbers (TOKEN_BUDGET_EXCEEDED).
 *
 * One meter for every model call a tenant's work makes — enrichment, research,
 * Smart Profile, drafting — whichever model served it (D-Q15).
 *
 * BYOK is metered and never capped: the cap exists because Vikuna pays
 * (ruling 2026-09-15). This replaces migration 217's "NULL = no cap": NULL on a
 * tenant's row now means "the .env default", and every platform tenant is
 * capped. It is a deliberate change of posture, made by D-Q12.
 */
import type { Pool, PoolClient } from 'pg';
import { createTenantDb, withTenantClient } from '../db';
import { resolveProvider } from './llm.provider';

/* ── .env (no defaults) ─────────────────────────────────────────────────── */

export interface BudgetConfig { dailyLimit: number; monthlyLimit: number }

export class BudgetConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`TOKEN_BUDGET_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'BudgetConfigError';
  }
}

export function readBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  const problems: string[] = [];
  const int = (name: string) => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) { problems.push(`${name}=${raw} is not a whole number ≥ 1`); return NaN; }
    return n;
  };
  const c = { dailyLimit: int('TENANT_DAILY_TOKEN_LIMIT'), monthlyLimit: int('TENANT_MONTHLY_TOKEN_LIMIT') };
  if (!problems.length && c.monthlyLimit < c.dailyLimit) {
    problems.push(`TENANT_MONTHLY_TOKEN_LIMIT (${c.monthlyLimit}) is below TENANT_DAILY_TOKEN_LIMIT (${c.dailyLimit})`);
  }
  if (problems.length) throw new BudgetConfigError(problems);
  return c;
}

export function assertBudgetConfig(scope: string): BudgetConfig {
  const c = readBudgetConfig();
  console.log(`[${scope}] Tenant token budget: ${c.dailyLimit.toLocaleString('en-US')} a day, `
    + `${c.monthlyLimit.toLocaleString('en-US')} a month (a tenant's own limit overrides; top-ups are spent after both)`);
  return c;
}

/* ── The budget ─────────────────────────────────────────────────────────── */

interface DailyUsage { vps?: number; escalation?: number }

export interface TokenBudget {
  /** The day's base in force (tenant's own, else .env). null when uncapped (BYOK). */
  limit: number | null;
  /** Tokens used today (UTC), every source. */
  used: number;
  monthly_limit: number | null;
  month_used: number;
  /** What the base still allows today: min(day left, month left), never below 0. */
  base_remaining: number;
  /** The top-up ledger's balance (can be negative after an overrun; then nothing is left). */
  topup_balance: number;
  /** base_remaining + a positive top-up balance. Infinity when uncapped. */
  remaining: number;
  /** A cap is in force (platform posture). False for BYOK — metered only. */
  capped: boolean;
  /** Where the limits came from. */
  daily_source: 'tenant' | 'platform';
  monthly_source: 'tenant' | 'platform';
  /** There is a context row, so usage is being recorded. */
  tracked: boolean;
}

const today = () => new Date().toISOString().split('T')[0];
const monthOf = (d: string) => d.slice(0, 7);
const sumDay = (u: DailyUsage | undefined) => (u?.vps ?? 0) + (u?.escalation ?? 0);

function compute(row: { daily_token_limit: number | null; monthly_token_limit: number | string | null; daily_token_usage: Record<string, DailyUsage> } | undefined,
  balance: number, cfg: BudgetConfig) {
  const usage = row?.daily_token_usage ?? {};
  const d = today();
  const used = sumDay(usage[d]);
  const month_used = Object.entries(usage).filter(([k]) => monthOf(k) === monthOf(d)).reduce((a, [, v]) => a + sumDay(v), 0);
  const ownDaily = typeof row?.daily_token_limit === 'number' && row.daily_token_limit > 0 ? row.daily_token_limit : null;
  const ownMonthly = row?.monthly_token_limit != null && Number(row.monthly_token_limit) > 0 ? Number(row.monthly_token_limit) : null;
  const limit = ownDaily ?? cfg.dailyLimit;
  const monthly_limit = ownMonthly ?? cfg.monthlyLimit;
  const base_remaining = Math.max(0, Math.min(limit - used, monthly_limit - month_used));
  return {
    limit, used, monthly_limit, month_used, base_remaining, topup_balance: balance,
    remaining: base_remaining + Math.max(0, balance),
    daily_source: (ownDaily ? 'tenant' : 'platform') as 'tenant' | 'platform',
    monthly_source: (ownMonthly ? 'tenant' : 'platform') as 'tenant' | 'platform',
  };
}

/**
 * What this tenant may still spend, before a call or a batch is planned.
 * Exported because a cap discovered by crashing into it is a trap: a long
 * agent plans how many companies fit, a screen says "7 fit in what is left".
 */
export async function getTokenBudget(pool: Pool, tenantId: string): Promise<TokenBudget> {
  const cfg = readBudgetConfig();
  const db = createTenantDb(pool, tenantId);
  const r = await db.query<{ daily_token_limit: number | null; monthly_token_limit: string | null; daily_token_usage: Record<string, DailyUsage> }>(
    `SELECT daily_token_limit, monthly_token_limit, daily_token_usage FROM gt_tenant_context WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId });
  const t = await db.query<{ balance: string | null }>(
    `SELECT coalesce(sum(tokens), 0) AS balance FROM gt_token_topups WHERE tenant_id = $tenant_id`, { tenant_id: tenantId });
  const balance = Number(t.rows[0]?.balance ?? 0);
  const c = compute(r.rows[0], balance, cfg);
  const posture = (await resolveProvider(pool, tenantId)).posture;
  if (posture === 'byok') {
    return { ...c, limit: null, monthly_limit: null, remaining: Number.POSITIVE_INFINITY, capped: false, tracked: Boolean(r.rows[0]) };
  }
  return { ...c, capped: true, tracked: Boolean(r.rows[0]) };
}

/** Refuse a call the budget cannot cover — before anything is sent. Platform posture only. */
export async function checkTokenBudget(pool: Pool, tenantId: string, estimatedTokens: number): Promise<void> {
  const b = await getTokenBudget(pool, tenantId);
  if (!b.capped) return;
  if (estimatedTokens > b.remaining) {
    const fmt = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'));
    throw new Error(
      `TOKEN_BUDGET_EXCEEDED: this call needs up to ${fmt(estimatedTokens)} tokens and ${fmt(b.remaining)} are left `
      + `(today ${fmt(b.used)} of ${fmt(b.limit)}, this month ${fmt(b.month_used)} of ${fmt(b.monthly_limit)}, `
      + `top-up balance ${fmt(Math.max(0, b.topup_balance))}). Nothing was sent. The daily and monthly limits do not rise; `
      + `an admin can add a top-up (Settings → Tokens), or wait for the day to reset at 00:00 UTC.`,
    );
  }
}

/**
 * Record what a call spent, and draw from the top-up whatever the base could
 * not cover — in one transaction, with the tenant's context row locked so two
 * calls finishing together cannot both spend the same base.
 */
export async function recordTokenUsage(
  pool: Pool, tenantId: string, tokens: number, source: 'vps' | 'escalation',
  opts: { posture: 'platform' | 'byok' | 'external'; runId?: string | number },
): Promise<void> {
  if (tokens <= 0) return;
  const cfg = readBudgetConfig();
  await withTenantClient(pool, tenantId, async (c: PoolClient) => {
    // A row is needed to record anything; creating it is not a decision about limits.
    await c.query(`INSERT INTO gt_tenant_context (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`, [tenantId]);
    const row = (await c.query(
      `SELECT daily_token_limit, monthly_token_limit, daily_token_usage FROM gt_tenant_context WHERE tenant_id = $1 FOR UPDATE`,
      [tenantId])).rows[0];
    const d = today();
    await c.query(
      `UPDATE gt_tenant_context
          SET daily_token_usage = jsonb_set(daily_token_usage, ARRAY[$2::text],
                COALESCE(daily_token_usage -> $2::text, '{"vps":0,"escalation":0}'::jsonb)
                || jsonb_build_object($3::text, COALESCE(((daily_token_usage -> $2::text) ->> $3::text)::bigint, 0) + $4::bigint), true),
              updated_at = now()
        WHERE tenant_id = $1`, [tenantId, d, source, tokens]);
    if (opts.posture === 'byok') return;                 // metered, never capped, never drawn
    const before = compute(row, 0, cfg).base_remaining;
    const drawn = Math.max(0, tokens - before);
    if (drawn > 0) {
      await c.query(
        `INSERT INTO gt_token_topups (tenant_id, tokens, reason, run_id) VALUES ($1, $2, $3, $4)`,
        [tenantId, -drawn, `drawn: the day's or month's base was used`, opts.runId == null ? null : String(opts.runId)]);
    }
  });
}

/* ── Top-ups (admin) ────────────────────────────────────────────────────── */

export async function addTopup(pool: Pool, tenantId: string, tokens: number, addedBy: string | null, reason: string): Promise<{ balance: number }> {
  if (!Number.isInteger(tokens) || tokens < 1) throw new Error('A top-up must be a whole number of tokens, at least 1.');
  return withTenantClient(pool, tenantId, async (c) => {
    await c.query(`INSERT INTO gt_token_topups (tenant_id, tokens, added_by, reason) VALUES ($1, $2, $3, $4)`,
      [tenantId, tokens, addedBy, `top-up: ${reason || 'added by admin'}`]);
    const b = await c.query(`SELECT coalesce(sum(tokens), 0) AS balance FROM gt_token_topups WHERE tenant_id = $1`, [tenantId]);
    return { balance: Number(b.rows[0].balance) };
  });
}
