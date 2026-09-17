/**
 * Does a dead worker's work come back?
 *
 * The claim UPDATE commits immediately, so between it and `resolveEvent` the
 * only record that work is in flight is the worker's memory. A worker that
 * dies in that window leaves the row `processing` forever, because the poll
 * only ever looks at `pending`. Nine rows were stranded this way on
 * 2026-08-17 and nothing reported it — `processing` is a legitimate state, and
 * a row stuck for three weeks looked exactly like one claimed a second ago.
 *
 * Every case here is written against a REAL Postgres, because the whole bug
 * lives in what the database does between two statements.
 */

import { execSync } from 'child_process';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { pollPendingEvents, reclaimStaleEvents, heartbeat, resolveEvent } from '../event.store';

const T = '11111111-1111-1111-1111-111111111111';

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

/** Migration 181's shape, before 253 adds to it. */
const BASE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE gt_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_type varchar(80) NOT NULL,
  source_type varchar(30) NOT NULL DEFAULT 'system',
  source_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(20) NOT NULL DEFAULT 'pending',
  processed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now());
`;

let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS event_reclaim_test');
  await admin.query('CREATE DATABASE event_reclaim_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'event_reclaim_test' });
  await pool.query(BASE);

  // A row stranded BEFORE the migration, to prove 253 adopts it. Nine of
  // these existed in production and were invisible to any reclaim.
  await pool.query(
    `INSERT INTO gt_events (tenant_id, event_type, status, created_at)
     VALUES ($1, 'URL_SUBMITTED', 'processing', now() - interval '3 weeks')`, [T]);

  // The REAL migration, not a copy — so a change to it that breaks the
  // reclaim fails here rather than on the VPS.
  await pool.query(fs.readFileSync(
    path.join(__dirname, '../../../migrations/253_gt_events_claim_reclaim.sql'), 'utf8'));
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

const seed = async (n = 1) => {
  for (let i = 0; i < n; i++) {
    await pool.query(
      `INSERT INTO gt_events (tenant_id, event_type) VALUES ($1, 'TEST_EVENT')`, [T]);
  }
};
const age = (id: string, interval: string) =>
  pool.query(`UPDATE gt_events SET started_at = now() - interval '${interval}' WHERE id = $1`, [id]);
const row = async (id: string) => (await pool.query(
  `SELECT status, attempts, started_at, error FROM gt_events WHERE id = $1`, [id])).rows[0];

const d = available ? describe : describe.skip;

d('the queue reclaims what a dead worker abandoned', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM gt_events WHERE event_type = 'TEST_EVENT'`);
  });

  it('adopts rows stranded before the migration existed', async () => {
    // Stamped with created_at rather than now(), so they are immediately
    // stale. Stamping now() would make a three-week-old orphan look freshly
    // claimed and it would wait all over again.
    const r = await pool.query(
      `SELECT started_at IS NOT NULL AS stamped,
              started_at < now() - interval '1 day' AS old
         FROM gt_events WHERE event_type = 'URL_SUBMITTED'`);
    expect(r.rows[0]).toEqual({ stamped: true, old: true });

    const out = await reclaimStaleEvents(pool);
    expect(out.requeued).toBe(1);
  });

  it('stamps the claim, so "in flight" is a fact about the row', async () => {
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    const r = await row(e.id);
    expect(r.status).toBe('processing');
    expect(r.attempts).toBe(1);
    expect(r.started_at).not.toBeNull();
  });

  it('returns an orphan to pending, and a second poll picks it up', async () => {
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    expect(await pollPendingEvents(pool, 5)).toHaveLength(0);   // claimed, invisible

    await age(e.id, '10 minutes');                              // its worker died
    expect((await reclaimStaleEvents(pool)).requeued).toBe(1);

    const again = await pollPendingEvents(pool, 5);
    expect(again.map((x) => x.id)).toEqual([e.id]);
    expect((await row(e.id)).attempts).toBe(2);
  });

  it('leaves a healthy in-flight claim alone', async () => {
    // The case that matters most: reclaiming a row a live worker is still
    // running means the work runs TWICE.
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    expect((await reclaimStaleEvents(pool)).requeued).toBe(0);
    expect((await row(e.id)).status).toBe('processing');
  });

  it('a heartbeat keeps a long job claimed past the threshold', async () => {
    // Enrichment runs 20+ minutes. Without the heartbeat the threshold would
    // have to exceed the slowest agent, and a genuine crash would sit
    // undetected for that long.
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    await age(e.id, '10 minutes');
    await heartbeat(pool, e.id);
    expect((await reclaimStaleEvents(pool)).requeued).toBe(0);
    expect((await row(e.id)).status).toBe('processing');
  });

  it('a heartbeat cannot resurrect an event that already finished', async () => {
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    await resolveEvent(pool, e.id, 'done');
    await heartbeat(pool, e.id);
    expect((await row(e.id)).status).toBe('done');
  });

  it('fails a poison event instead of looping on it forever', async () => {
    // An event that kills the worker would otherwise be reclaimed, kill it
    // again, and loop until a person noticed. The cap turns it into a failed
    // row carrying the reason.
    await seed();
    const [e] = await pollPendingEvents(pool, 5);
    for (let i = 0; i < 2; i++) {
      await age(e.id, '10 minutes');
      await reclaimStaleEvents(pool);
      await pollPendingEvents(pool, 5);
    }
    expect((await row(e.id)).attempts).toBe(3);

    await age(e.id, '10 minutes');
    const out = await reclaimStaleEvents(pool);
    expect(out).toEqual({ requeued: 0, failed: 1 });

    const r = await row(e.id);
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/WORKER_ORPHANED: claimed 3 times/);
    expect(await pollPendingEvents(pool, 5)).toHaveLength(0);   // and it stays gone
  });

  it('does not reclaim a healthy BACKLOG, which is the trap', async () => {
    // The workaround that looks fine: time out on created_at. Ten events
    // queued and worked one at a time all have an old created_at, so that
    // rule reclaims rows a live worker is running and the work happens TWICE.
    // started_at is what separates "queued long ago" from "claimed long ago".
    await seed(3);
    await pool.query(
      `UPDATE gt_events SET created_at = now() - interval '2 hours'
        WHERE event_type = 'TEST_EVENT'`);
    const claimed = await pollPendingEvents(pool, 1);
    expect(claimed).toHaveLength(1);

    expect(await reclaimStaleEvents(pool)).toEqual({ requeued: 0, failed: 0 });
    expect((await row(claimed[0].id)).status).toBe('processing');
  });

  it('claims exactly the batch size, which it did not before', async () => {
    // `WHERE id IN (SELECT ... LIMIT n)` reads as though it claims n rows and
    // does not: Postgres plans it as a Nested Loop Semi Join and re-runs the
    // LIMIT subquery per outer row, so EVERY pending event is claimed.
    // LIMIT 1 against three pending rows claimed all three.
    //
    // WORKER_BATCH_SIZE was therefore never respected, and processEvent is
    // fire-and-forget — so twenty queued events meant twenty agents running
    // at once, each holding an LLM call.
    await seed(5);
    expect(await pollPendingEvents(pool, 2)).toHaveLength(2);
    expect(await pollPendingEvents(pool, 2)).toHaveLength(2);
    expect(await pollPendingEvents(pool, 2)).toHaveLength(1);
    expect(await pollPendingEvents(pool, 2)).toHaveLength(0);
  });

  it('never touches a done or failed row', async () => {
    await seed(2);
    const two = await pollPendingEvents(pool, 5);
    await resolveEvent(pool, two[0].id, 'done');
    await resolveEvent(pool, two[1].id, 'failed', 'real failure');
    await pool.query(
      `UPDATE gt_events SET started_at = now() - interval '1 day'
        WHERE event_type = 'TEST_EVENT'`);

    expect(await reclaimStaleEvents(pool)).toEqual({ requeued: 0, failed: 0 });
    expect((await row(two[1].id)).error).toBe('real failure');
  });
});
