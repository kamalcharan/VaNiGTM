/**
 * The run stream over real HTTP against the real schema: steps arrive as they
 * are written, a parked run says what it needs, the stream ends with the run,
 * a reconnect resumes after the last step it saw, and another tenant's run is
 * a 404.
 */
import { execSync } from 'child_process';
import path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import { Pool } from 'pg';
import { createRunStreamRouter } from '../run-stream';
import { appendStep } from '../../agent-core/agent.runner';
import { register } from '../../auth/auth.service';
import { signAccessToken } from '../../auth/token.service';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'run_stream_test';
const BACKEND = path.resolve(__dirname, '../../..');
const available = (() => { try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; } catch { return false; } })();
const fakeReq = { headers: { 'user-agent': 'jest' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;

let pool: Pool; let server: ReturnType<express.Express['listen']>; let origin = '';
let mine = { token: '', tenant: '' }; let theirs = { token: '' };

beforeAll(async () => {
  if (!available) return;
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`); await root.query(`CREATE DATABASE ${DB}`); await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  const a = await register(pool, { name: 'A', email: 'a@stream.test', password: 'Passw0rdA', tenant_name: 'Stream A' }, fakeReq);
  mine = { tenant: a.tenant.id, token: signAccessToken({ user_id: a.user.id, tenant_id: a.tenant.id, email: 'a@stream.test', role: 'owner', is_live: true } as any) };
  const b = await register(pool, { name: 'B', email: 'b@stream.test', password: 'Passw0rdA', tenant_name: 'Stream B' }, fakeReq);
  theirs = { token: b.tokens.access_token };
  const app = express(); app.use('/runs', createRunStreamRouter(pool));
  server = app.listen(0); origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 180000);
afterAll(async () => { if (server) server.close(); if (pool) await pool.end(); });

/** Read an SSE response into [{event, id, data}] until it ends. */
async function readEvents(res: Response, onEvent?: (e: any) => void) {
  const out: any[] = []; const dec = new TextDecoder(); let buf = '';
  const reader = res.body!.getReader();
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, i); buf = buf.slice(i + 2);
      if (block.startsWith(':')) continue;
      const e: any = {};
      for (const line of block.split('\n')) {
        const [k, ...rest] = line.split(': '); const v = rest.join(': ');
        if (k === 'event') e.event = v; if (k === 'id') e.id = Number(v); if (k === 'data') e.data = JSON.parse(v);
      }
      out.push(e); onEvent?.(e);
    }
  }
  return out;
}
const open = (id: string, token: string, headers: Record<string, string> = {}) =>
  fetch(`${origin}/runs/${id}/stream`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
const newRun = async (agent = 'URL_SUBMITTED') =>
  String((await pool.query(`INSERT INTO gt_agent_runs (tenant_id, agent_name, status) VALUES ($1, $2, 'running') RETURNING id`, [mine.tenant, agent])).rows[0].id);

const d = available ? describe : describe.skip;
d('GET /runs/:id/stream', () => {
  it('pushes steps as they are written, asks when parked, and ends with the run', async () => {
    const id = await newRun();
    await appendStep(pool, id, { step_name: 'fetch', action: 'Fetched the page', status: 'ok' });
    const res = await open(id, mine.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    let wrote = false;
    const events = await readEvents(res, async (e) => {
      if (e.event === 'step_finished' && !wrote) {
        wrote = true;
        await appendStep(pool, id, { step_name: 'extract', action: 'Extracted 14 facts', status: 'ok' });
        await pool.query(`UPDATE gt_agent_runs SET status = 'awaiting', awaiting_input = '{"kind":"failover"}' WHERE id = $1`, [id]);
        setTimeout(() => pool.query(`UPDATE gt_agent_runs SET status = 'completed', completed_at = now() WHERE id = $1`, [id]), 300);
      }
    });
    expect(events.map((e) => e.event)).toEqual(['run_started', 'step_finished', 'step_finished', 'decision_needed', 'run_finished']);
    expect(events[0].data).toMatchObject({ agent: 'Ingestion', steps_so_far: 1 });
    expect(events[2]).toMatchObject({ id: 1, data: { step_name: 'extract' } });
    expect(events[3].data.awaiting_input).toEqual({ kind: 'failover' });
  });

  it('a reconnect resumes after the last step it saw', async () => {
    const id = await newRun();
    for (const n of ['a', 'b', 'c']) await appendStep(pool, id, { step_name: n, action: n, status: 'ok' });
    await pool.query(`UPDATE gt_agent_runs SET status = 'failed', error_message = 'boom' WHERE id = $1`, [id]);
    const events = await readEvents(await open(id, mine.token, { 'Last-Event-ID': '0' }));
    expect(events.filter((e) => e.event === 'step_finished').map((e) => e.data.step_name)).toEqual(['b', 'c']);
    expect(events[events.length - 1]).toMatchObject({ event: 'run_failed', data: { error: 'boom' } });
  });

  it('another tenant cannot open it; no token is a 401', async () => {
    const id = await newRun();
    expect((await open(id, theirs.token)).status).toBe(404);
    expect((await fetch(`${origin}/runs/${id}/stream`)).status).toBe(401);
    await pool.query(`UPDATE gt_agent_runs SET status = 'completed' WHERE id = $1`, [id]);
  });

  it('a connection ends at RUNS_STREAM_MAX_SECONDS and says where to resume', async () => {
    const before = process.env.RUNS_STREAM_MAX_SECONDS;
    process.env.RUNS_STREAM_MAX_SECONDS = '10';
    const id = await newRun();
    await appendStep(pool, id, { step_name: 'only', action: 'only', status: 'ok' });
    const t0 = Date.now();
    const events = await readEvents(await open(id, mine.token));
    expect(Date.now() - t0).toBeGreaterThanOrEqual(9_500);
    expect(events[events.length - 1]).toMatchObject({ event: 'stream_expired', data: { resume_after: 0 } });
    process.env.RUNS_STREAM_MAX_SECONDS = before;
  }, 20000);
});
