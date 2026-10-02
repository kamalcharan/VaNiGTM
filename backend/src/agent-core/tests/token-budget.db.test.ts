/**
 * The tenant token budget — D-Q12, S18 (migration 274) — against the real schema:
 *
 *   - the day's and month's base come from .env; a tenant's own row overrides
 *   - a call the base can cover draws nothing; the part it cannot is drawn from
 *     the top-up ledger as a − row; the balance is the sum
 *   - when base and top-up are both spent, the next call is refused BEFORE it is sent
 *   - the monthly base binds as well as the daily one
 *   - set_budget may lower a tenant's daily limit, never raise it
 *   - add_topup and topups are admin only
 */
import { execSync } from 'child_process';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import { Pool } from 'pg';
import { addTopup, getTokenBudget, recordTokenUsage } from '../token.budget';
import { callLLM } from '../llm.client';
import { invalidateAllProviders } from '../llm.provider';
import { set_budget } from '../../skills/research-skill/functions/set-budget';
import { add_topup } from '../../skills/tenant/functions/add-topup';
import { topups } from '../../skills/tenant/functions/topups';
import { createTenantDb } from '../../db/query';

let mockPool: Pool | undefined;
jest.mock('../../db/pool', () => ({ getPool: () => mockPool }));

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'token_budget_test';
const BACKEND = path.resolve(__dirname, '../../..');
const T = '66666666-6666-6666-6666-666666666666';
const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;
let pool: Pool;
let server: http.Server;
let answerTokens = 0;
let hits = 0;
const saved = { ...process.env };

beforeAll(async () => {
  if (!available) return;
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  mockPool = pool;
  await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'budget-t')`, [T]);
  // A platform model that reports exactly `answerTokens` tokens used.
  server = http.createServer((req, res) => {
    req.resume(); req.on('end', () => {
      hits++;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 0, completion_tokens: answerTokens } }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  process.env.LLM_PRIMARY_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.TENANT_DAILY_TOKEN_LIMIT = '1000';
  process.env.TENANT_MONTHLY_TOKEN_LIMIT = '5000';
  invalidateAllProviders();
}, 180000);
afterAll(async () => {
  process.env = saved;
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (pool) await pool.end();
});

const call = (maxTokens = 100) => callLLM({ tenantId: T, pool, runId: 0, system: 's', messages: [{ role: 'user', content: 'u' }], maxTokens });
const balance = async () => Number((await pool.query(`SELECT coalesce(sum(tokens),0) b FROM gt_token_topups WHERE tenant_id = $1`, [T])).rows[0].b);
const ADMIN = { tenant_id: T, is_live: false, user_id: '', role: 'owner', is_admin: true, db: null };

d('the tenant token budget', () => {
  it('starts from the .env base, every platform tenant capped', async () => {
    const b = await getTokenBudget(pool, T);
    expect(b).toMatchObject({ capped: true, limit: 1000, monthly_limit: 5000, used: 0, remaining: 1000, daily_source: 'platform' });
  });

  it('spends the base first and draws nothing from a top-up while the base lasts', async () => {
    await addTopup(pool, T, 500, null, 'test');
    answerTokens = 600; await call();
    expect(await balance()).toBe(500);
    expect((await getTokenBudget(pool, T))).toMatchObject({ used: 600, base_remaining: 400, remaining: 900 });
  });

  it('draws the part the base cannot cover from the top-up, as a ledger row', async () => {
    answerTokens = 600; await call();                       // 400 from the base, 200 drawn
    expect(await balance()).toBe(300);
    const drawn = (await pool.query(`SELECT tokens, reason FROM gt_token_topups WHERE tenant_id = $1 AND tokens < 0`, [T])).rows;
    expect(drawn).toEqual([expect.objectContaining({ tokens: '-200', reason: expect.stringMatching(/^drawn/) })]);
    expect((await getTokenBudget(pool, T))).toMatchObject({ base_remaining: 0, topup_balance: 300, remaining: 300 });
  });

  it('refuses a call the base and the top-up cannot cover, before it is sent — with the numbers', async () => {
    const before = hits;
    await expect(call(400)).rejects.toThrow(/TOKEN_BUDGET_EXCEEDED: this call needs up to 400 tokens and 300 are left.*Nothing was sent/);
    expect(hits).toBe(before);
    answerTokens = 250; await call(250);                    // fits in the 300 left
    expect(await balance()).toBe(50);
  });

  it('the monthly base binds as well as the daily one', async () => {
    const db = createTenantDb(pool, T);
    // Pretend earlier days this month spent 4,500 of the 5,000.
    const day = new Date(); day.setUTCDate(1);
    const first = day.toISOString().slice(0, 10);
    const today = new Date().toISOString().slice(0, 10);
    if (first !== today) {
      await db.query(`UPDATE gt_tenant_context SET daily_token_usage = daily_token_usage || jsonb_build_object($d::text, '{"vps":4500}'::jsonb) WHERE tenant_id = $tenant_id`,
        { d: first, tenant_id: T });
      const b = await getTokenBudget(pool, T);
      expect(b.month_used).toBeGreaterThanOrEqual(4500);
      expect(b.base_remaining).toBe(0);
    }
  });

  it("set_budget may lower the tenant's daily limit, never raise it", async () => {
    const ctx = { ...ADMIN, db: createTenantDb(pool, T) } as never;
    await expect(set_budget({ daily_token_limit: 2000 }, ctx)).rejects.toThrow(/between 10,000 and the platform's 1,000|platform's 1,000/);
    process.env.TENANT_DAILY_TOKEN_LIMIT = '100000';
    process.env.TENANT_MONTHLY_TOKEN_LIMIT = '2000000';
    try {
      const r = await set_budget({ daily_token_limit: 50000 }, ctx);
      expect(r).toMatchObject({ daily_token_limit: 50000, capped: true });
      expect((await getTokenBudget(pool, T))).toMatchObject({ limit: 50000, daily_source: 'tenant' });
      await set_budget({ daily_token_limit: null }, ctx);
      expect((await getTokenBudget(pool, T))).toMatchObject({ limit: 100000, daily_source: 'platform' });
    } finally {
      process.env.TENANT_DAILY_TOKEN_LIMIT = '1000';
      process.env.TENANT_MONTHLY_TOKEN_LIMIT = '5000';
    }
  });

  it('top-ups are added and listed by an admin only, and the ledger is append-only', async () => {
    const r = await add_topup({ tenant_id: T, tokens: 1000, reason: 'pilot' }, ADMIN as never);
    expect(r.balance).toBe(1050);
    await expect(add_topup({ tenant_id: T, tokens: 10 }, { ...ADMIN, is_admin: false } as never)).rejects.toThrow(/admin/);
    const list = await topups({}, ADMIN as never);
    expect(list.tenants.find((t: { tenant_id: string }) => t.tenant_id === T)).toMatchObject({ added: 1500, drawn: 450, balance: 1050 });
    await expect(pool.query('DELETE FROM gt_token_topups')).rejects.toThrow(/append-only/);
  });

  it('records usage for a tenant with no context row yet (creating it)', async () => {
    const N = '77777777-7777-7777-7777-777777777777';
    await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'budget-new')`, [N]);
    await recordTokenUsage(pool, N, 120, 'vps', { posture: 'platform' });
    expect((await getTokenBudget(pool, N))).toMatchObject({ used: 120, tracked: true });
  });
});
