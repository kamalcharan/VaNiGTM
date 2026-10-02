/**
 * The model router end to end: the REAL schema (every migration, 272
 * included), real HTTP to three fake providers, the admin's switches written
 * through the skill. What it proves (release 2 checkout, POA §4a):
 *
 *   - nothing is used until the admin switches it on
 *   - a 429 moves the call on, cools that provider down for the NEXT call too,
 *     and both are visible (a gt_llm_calls row, a step in the run)
 *   - tenant data never reaches a provider that may train on it
 *   - a bad answer moves to the next provider, recorded as a verdict
 *   - a provider's daily quota is counted from gt_llm_calls and obeyed
 *   - the switch is append-only and admin only
 */
import { execSync } from 'child_process';
import http from 'http';
import type { AddressInfo } from 'net';
import path from 'path';
import { Pool } from 'pg';
import { z } from 'zod';
import { callLLM, callLLMValidated } from '../llm.client';
import { invalidateAllProviders } from '../llm.provider';
import { switch_provider } from '../../skills/model-router-skill/functions/switch-provider';
import { overview } from '../../skills/model-router-skill/functions/overview';
import { test_provider } from '../../skills/model-router-skill/functions/test-provider';

let mockPool: Pool | undefined;
jest.mock('../../db/pool', () => ({ getPool: () => mockPool }));

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'llm_router_test';
const BACKEND = path.resolve(__dirname, '../../..');
const TENANT = '22222222-2222-2222-2222-222222222222';
const CTX = { tenant_id: TENANT, is_live: false, user_id: null, is_admin: true, db: null };
const ADMIN = CTX as never;

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;

/** A fake OpenAI-compatible provider whose next answers are scripted. */
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
function fake() {
  const hits: Array<{ model: string }> = [];
  let script: Reply[] = [];
  const ok = (text: string): Reply => ({ status: 200, body: { choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 40, completion_tokens: 5 } } });
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      hits.push({ model: JSON.parse(raw || '{}').model });
      const r = script.shift() ?? ok('{"industry":"Lab equipment"}');
      res.writeHead(r.status, { 'content-type': 'application/json', ...(r.headers ?? {}) });
      res.end(JSON.stringify(r.body ?? { error: 'scripted' }));
    });
  });
  return {
    server, hits, ok,
    url: () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
    next: (...r: Reply[]) => { script = r; },
    reset: () => { hits.length = 0; script = []; },
  };
}
const groq = fake(); const openrouter = fake(); const qwen = fake();

let pool: Pool;
const saved = { ...process.env };

beforeAll(async () => {
  if (!available) return;
  await Promise.all([groq, openrouter, qwen].map((f) => new Promise<void>((r) => f.server.listen(0, '127.0.0.1', () => r()))));
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  mockPool = pool;
  Object.assign(process.env, {
    LLM_PRIMARY_URL: qwen.url(), ANTHROPIC_API_KEY: '',
    LLM_PROVIDERS: 'groq,openrouter',
    LLM_ROUTE_HIGH: 'groq,openrouter,qwen', LLM_ROUTE_MEDIUM: 'qwen', LLM_ROUTE_LOW: 'qwen',
    LLM_ROUTER_COOLDOWN_SECONDS: '60',
    LLM_GROQ_URL: groq.url(), LLM_GROQ_KEY: 'secret-groq-key', LLM_GROQ_MODEL: 'llama-groq', LLM_GROQ_CTX: '8000',
    LLM_GROQ_RPM: '0', LLM_GROQ_DAILY: '0', LLM_GROQ_DATA_TERMS: 'no_training',
    LLM_OPENROUTER_URL: openrouter.url(), LLM_OPENROUTER_KEY: 'secret-or-key', LLM_OPENROUTER_MODEL: 'llama-free', LLM_OPENROUTER_CTX: '8000',
    LLM_OPENROUTER_RPM: '0', LLM_OPENROUTER_DAILY: '3', LLM_OPENROUTER_DATA_TERMS: 'may_train',
  });
  invalidateAllProviders();
}, 180000);

afterAll(async () => {
  process.env = saved;
  await Promise.all([groq, openrouter, qwen].map((f) => new Promise<void>((r) => f.server.close(() => r()))));
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  groq.reset(); openrouter.reset(); qwen.reset();
  await pool.query('TRUNCATE gt_llm_calls, gt_llm_provider_switch');
});

const ask = (o: Partial<Parameters<typeof callLLM>[0]> = {}) => callLLM({
  tenantId: TENANT, pool, runId: 0, system: 'Classify.', messages: [{ role: 'user', content: 'Kavya Lab Instruments' }],
  maxTokens: 50, route: 'high', dataClass: 'public_company', step: 'classify_industry', purpose: 'enrichment', ...o,
});
const turnOn = (...codes: string[]) => Promise.all(codes.map((c) => switch_provider({ provider_code: c, enabled: true }, ADMIN)));
const calls = async () => (await pool.query('SELECT provider_code, outcome, rung, cooldown_until FROM gt_llm_calls ORDER BY id')).rows;

d('the model router', () => {
  it('uses nothing until the admin switches it on, and says so', async () => {
    await expect(ask()).rejects.toThrow(/LLM_ROUTE_EXHAUSTED.*groq: switched off; openrouter: switched off; qwen: switched off.*Nothing was guessed/);
    expect(groq.hits.length + openrouter.hits.length + qwen.hits.length).toBe(0);
  });

  it('serves from the first provider that is on, and records the call', async () => {
    await turnOn('groq', 'qwen');
    const r = await ask();
    expect(r.provider).toBe('groq');
    expect(groq.hits).toEqual([{ model: 'llama-groq' }]);
    expect(await calls()).toEqual([expect.objectContaining({ provider_code: 'groq', outcome: 'ok', rung: 1 })]);
  });

  it('a 429 moves the call on, and the cooldown holds for the next call', async () => {
    await turnOn('groq', 'openrouter');
    groq.next({ status: 429, headers: { 'retry-after': '30' } });
    const r = await ask();
    expect(r.provider).toBe('openrouter');
    const rows = await calls();
    expect(rows[0]).toMatchObject({ provider_code: 'groq', outcome: 'rate_limited' });
    expect(new Date(rows[0].cooldown_until).getTime() - Date.now()).toBeGreaterThan(20000);
    expect(rows[1]).toMatchObject({ provider_code: 'openrouter', outcome: 'ok', rung: 2 });
    // The next call does not knock on groq's door at all.
    await ask();
    expect(groq.hits.length).toBe(1);
    expect(openrouter.hits.length).toBe(2);
  });

  it('tenant data skips a provider that may train on prompts', async () => {
    await turnOn('openrouter', 'qwen');
    const r = await ask({ dataClass: 'tenant' });
    expect(r.provider).toBe('qwen');
    expect(openrouter.hits.length).toBe(0);
  });

  it('a bad answer goes to the next provider and is recorded as a verdict', async () => {
    await turnOn('groq', 'openrouter');
    groq.next(groq.ok('not json'), groq.ok('still not json'));
    const v = await callLLMValidated({
      tenantId: TENANT, pool, runId: 0, system: 'JSON only.', messages: [{ role: 'user', content: 'Kavya' }],
      maxTokens: 50, route: 'high', dataClass: 'public_company', step: 'classify_industry', purpose: 'enrichment',
    }, z.object({ industry: z.string() }));
    expect(v).toEqual({ industry: 'Lab equipment' });
    expect((await calls()).map((c) => `${c.provider_code}:${c.outcome}`)).toEqual(['groq:ok', 'groq:ok', 'groq:invalid', 'openrouter:ok']);
  });

  it("obeys a provider's daily quota, counted from the calls table", async () => {
    await turnOn('openrouter', 'qwen');
    for (let i = 0; i < 3; i++) expect((await ask()).provider).toBe('openrouter');
    expect((await ask()).provider).toBe('qwen');
    expect(openrouter.hits.length).toBe(3);
  });

  it('writes the moves into the run, where a person reads them', async () => {
    const run = await pool.query(`INSERT INTO gt_agent_runs (tenant_id, agent_name, status) VALUES ($1, 'enrichment', 'running') RETURNING id`, [TENANT]);
    await turnOn('groq', 'qwen');
    groq.next({ status: 500, body: { error: 'down' } });
    await ask({ runId: run.rows[0].id });
    const steps = (await pool.query('SELECT steps FROM gt_agent_runs WHERE id = $1', [run.rows[0].id])).rows[0].steps;
    const lines = steps.map((s: { step_name: string; action: string }) => `${s.step_name}: ${s.action}`).join('\n');
    expect(lines).toMatch(/llm_route: route high: skipped openrouter \(switched off\)/);
    expect(lines).toMatch(/llm_route: groq failed — LLM_PROVIDER_ERROR.*; trying qwen/);
    expect(lines).toMatch(/model_call: test-model/);
  });

  it('the switch is append-only, a repeat appends nothing, and only an admin may use it', async () => {
    expect((await switch_provider({ provider_code: 'groq', enabled: true }, ADMIN)).changed).toBe(true);
    expect((await switch_provider({ provider_code: 'groq', enabled: true }, ADMIN)).changed).toBe(false);
    expect((await switch_provider({ provider_code: 'groq', enabled: false, note: 'quota' }, ADMIN)).changed).toBe(true);
    expect((await pool.query('SELECT enabled FROM gt_llm_provider_switch ORDER BY id')).rows.map((r) => r.enabled)).toEqual([true, false]);
    await expect(switch_provider({ provider_code: 'groq', enabled: true }, { ...CTX, is_admin: false } as never)).rejects.toThrow(/admin/);
    await expect(switch_provider({ provider_code: 'mistral', enabled: true }, ADMIN)).rejects.toThrow(/not a configured provider/);
    // Held by the database, whatever a grant script later hands out.
    await expect(pool.query('UPDATE gt_llm_provider_switch SET enabled = true')).rejects.toThrow(/append-only/);
    await pool.query(`INSERT INTO gt_llm_calls (tenant_id, purpose, route, rung, provider_code, model, data_class, outcome)
                      VALUES ($1, 'enrichment', 'high', 1, 'groq', 'm', 'public_company', 'ok')`, [TENANT]);
    await expect(pool.query('DELETE FROM gt_llm_calls')).rejects.toThrow(/append-only/);
  });

  it('the overview shows each provider, the routes as they run now, and today', async () => {
    await turnOn('groq', 'openrouter', 'qwen');
    await ask();
    const o = await overview({}, ADMIN);
    expect(o.providers.map((p: { code: string; state: string }) => `${p.code}:${p.state}`)).toEqual(['groq:serving', 'openrouter:serving', 'qwen:serving']);
    expect(JSON.stringify(o)).not.toMatch(/secret-groq-key|secret-or-key/);  // no key ever leaves
    const high = o.routes.find((r: { route: string }) => r.route === 'high')!;
    expect(high.plan.tenant.serves).toEqual(['groq', 'qwen']);
    expect(high.plan.people.serves).toEqual(['qwen']);
    expect(o.usage).toEqual([expect.objectContaining({ route: 'high', provider_code: 'groq', calls: 1, ok: 1 })]);
  });

  it('tests a free provider regardless of its switch', async () => {
    groq.next(groq.ok('ready'));
    const r = await test_provider({ provider_code: 'groq' }, ADMIN);
    expect(r).toMatchObject({ ok: true, answer: 'ready', model: 'llama-groq' });
  });

  it('an unrouted call is untouched: the platform model, no router rows', async () => {
    await callLLM({ tenantId: TENANT, pool, runId: 0, system: 's', messages: [{ role: 'user', content: 'u' }], maxTokens: 20 });
    expect(qwen.hits.length).toBe(1);
    expect(await calls()).toEqual([]);
  });

  it('a routed call must say what its data is', async () => {
    await expect(ask({ dataClass: undefined })).rejects.toThrow(/LLM_ROUTE_NO_DATA_CLASS/);
  });
});
