/**
 * POA C5 — the platform LLM lane holds ACROSS processes.
 *
 * The in-process lane (llm.gate.ts) covered one worker. The API process, a
 * second worker, or another box each had their own, so two processes on the
 * self-hosted model still made two calls at once — the failure mode of run
 * 114. These tests start REAL separate processes against a real Postgres and
 * measure the overlap.
 *
 * Needs Postgres at PGHOST/PGPORT/PGUSER (a role that may CREATE DATABASE).
 * The probe is synchronous on purpose: describe.skip is decided at collection
 * time, before any beforeAll could run.
 */
import { execSync, spawn } from 'child_process';
import path from 'path';
import { Pool } from 'pg';

const HOST = process.env.PGHOST || '/var/run/postgresql';
const PORT = Number(process.env.PGPORT) || 5432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'llm_lane_test';
const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;
const url = `postgresql://${USER}@/${DB}?host=${encodeURIComponent(HOST)}&port=${PORT}`;
const CHILD = path.join(__dirname, 'fixtures', 'lane-child.ts');
const BACKEND = path.join(__dirname, '../../..');

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
}, 30000);

type Span = { start: number; end: number };

function runChild(env: Record<string, string>): { done: Promise<Span[]>; kill: () => void; started: Promise<void> } {
  // node itself with the tsx loader, NOT the tsx binary: tsx runs the script in
  // a grandchild, so killing it would leave the real holder alive — the first
  // version of the kill test measured exactly that.
  const p = spawn(process.execPath, ['--import', 'tsx', CHILD],
    { cwd: BACKEND, env: { ...process.env, LANE_DB: url, ...env } });
  let out = '';
  let resolveStarted!: () => void;
  const started = new Promise<void>((r) => { resolveStarted = r; });
  p.stdout.on('data', (b) => { out += b; if (out.includes('start ')) resolveStarted(); });
  p.stderr.on('data', (b) => { out += b; });
  const done = new Promise<Span[]>((resolve, reject) => {
    p.on('exit', (code, signal) => {
      if (code !== 0 && !signal) { reject(new Error(`child exited ${code}: ${out}`)); return; }
      const starts = [...out.matchAll(/start (\d+)/g)].map((m) => Number(m[1]));
      const ends = [...out.matchAll(/end (\d+)/g)].map((m) => Number(m[1]));
      resolve(starts.slice(0, ends.length).map((s, i) => ({ start: s, end: ends[i] })));
    });
  });
  return { done, kill: () => p.kill('SIGKILL'), started };
}

/** Most calls in flight at any instant, across all spans. */
function maxOverlap(spans: Span[]): number {
  const edges = spans.flatMap((s) => [[s.start, 1], [s.end, -1]] as const)
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // ends before starts at the same ms
  let cur = 0, max = 0;
  for (const [, delta] of edges) { cur += delta; max = Math.max(max, cur); }
  return max;
}

d('the platform LLM lane holds across processes (C5)', () => {
  it('LLM_MAX_CONCURRENT=1: three processes, six calls, never two at once', async () => {
    const kids = [1, 2, 3].map(() => runChild({ LLM_MAX_CONCURRENT: '1', CALLS: '2', HOLD_MS: '250' }));
    const spans = (await Promise.all(kids.map((k) => k.done))).flat();
    expect(spans).toHaveLength(6);
    expect(maxOverlap(spans)).toBe(1);
  }, 60000);

  it('LLM_MAX_CONCURRENT=2: runs two at once, never three', async () => {
    const kids = [1, 2, 3].map(() => runChild({ LLM_MAX_CONCURRENT: '2', CALLS: '2', HOLD_MS: '400' }));
    const spans = (await Promise.all(kids.map((k) => k.done))).flat();
    expect(spans).toHaveLength(6);
    expect(maxOverlap(spans)).toBe(2);
  }, 60000);

  it('a process killed while holding the slot does not strand it', async () => {
    // Holds for 30s — far longer than the test — then is killed mid-call.
    const holder = runChild({ LLM_MAX_CONCURRENT: '1', CALLS: '1', HOLD_MS: '30000' });
    await holder.started;
    const t0 = Date.now();
    const waiter = runChild({ LLM_MAX_CONCURRENT: '1', CALLS: '1', HOLD_MS: '50' });
    await new Promise((r) => setTimeout(r, 1500));
    holder.kill();                                   // its connection dies, and the lock with it
    const [span] = await waiter.done;
    expect(span).toBeDefined();
    expect(span.start - t0).toBeLessThan(15000);     // got the slot soon after the kill, not after 30s
    await holder.done.catch(() => undefined);
  }, 60000);
});
