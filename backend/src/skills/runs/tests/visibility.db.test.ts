/**
 * The visibility reads (runs · dashboard · agents · vara/gtm journey) against a
 * database built from the REAL migrations — not a hand-made subset — because
 * these functions join gt_agent_runs, gt_events, gt_kg_nodes, gt_tenant_profile
 * and the vani_ spine, and a subset would only prove the subset.
 *
 * Needs a database at VISIBILITY_TEST_DB (default vani_mig) that has had
 * `npm run db:migrate` and `npm run db:seed` run against it; skipped, loudly
 * named, when it is not there. Rows it creates are tagged and removed after.
 *
 * Three-check pattern per read: valid data · empty · wrong tenant → nothing.
 */
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { createTenantDb } from '../../../db/query';
import { createRun, setStatus, appendStep } from '../../../agent-core/agent.runner';
import { emitEvent } from '../../../agent-core/event.store';
import { upsertNode } from '../../../agent-core/kg.store';
import { list } from '../functions/list';
import { get } from '../functions/get';
import { events } from '../functions/events';
import { awaiting } from '../functions/awaiting';
import { brain } from '../../dashboard/functions/brain';
import { counters } from '../../dashboard/functions/counters';
import { activity } from '../../dashboard/functions/activity';
import { list as agentsList } from '../../agents/functions/list';
import { journey as varaJourney } from '../../vara/functions/journey';
import { journey as gtmJourney } from '../../gtm/functions/journey';

const DB = process.env.VISIBILITY_TEST_DB || 'vani_mig';
const HOST = process.env.PGHOST || '/var/run/postgresql';
const PORT = Number(process.env.PGPORT) || 5432;
const USER = process.env.PGUSER || 'root';

let pool: Pool;
// Decided SYNCHRONOUSLY at module load: describe.skip is chosen at collection
// time, before any beforeAll runs, so an async probe would always skip.
const T: string = (() => {
  try {
    return execSync(
      `psql -h ${HOST} -p ${PORT} -U ${USER} -d ${DB} -Atc "select id from vn_tenants where slug='vikuna' limit 1"`,
      { stdio: ['ignore', 'pipe', 'ignore'] },
    ).toString().trim();
  } catch { return ''; }
})();
const available = /^[0-9a-f-]{36}$/.test(T);
const OTHER = '99999999-9999-4999-8999-999999999999';   // a tenant that exists but owns nothing here

const ctxFor = (tenant: string) => ({
  tenant_id: tenant, is_live: false, user_id: '00000000-0000-0000-0000-000000000001', is_admin: false,
  db: createTenantDb(pool, tenant),
});

beforeAll(async () => {
  if (!available) return;
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'vis-other') ON CONFLICT (id) DO NOTHING`, [OTHER]);
}, 30000);

afterAll(async () => {
  if (!available) return;
  await pool.query(`DELETE FROM gt_kg_nodes WHERE tenant_id = $1 AND name LIKE 'vis-test-%'`, [T]);
  await pool.query(`DELETE FROM gt_agent_runs WHERE agent_name LIKE 'VIS_TEST_%'`);
  await pool.query(`DELETE FROM gt_events WHERE event_type::text LIKE 'VIS_TEST_%' OR source_id LIKE 'vis-test-%'`);
  await pool.query(`DELETE FROM vn_tenants WHERE id = $1`, [OTHER]);
  await pool.end();
});

const d = available ? describe : describe.skip;

d('visibility reads on a migrated database', () => {
  let runId = '';
  let eventId = '';

  it('seeds one run with steps, a node it wrote, and an unconsumed event', async () => {
    eventId = await emitEvent(pool, T, 'URL_SUBMITTED', 'human', { source_id: 'vis-test-src' }, 'vis-test-src');
    runId = await createRun(pool, T, 'VIS_TEST_URL', eventId, { source_id: 'vis-test-src' });
    await setStatus(pool, runId, 'running');
    await appendStep(pool, runId, { step_name: 'init', action: 'Processing', status: 'ok' });
    await appendStep(pool, runId, { step_name: 'extract', action: 'Read 6 pages', output_summary: '7 nodes', status: 'ok' });
    await upsertNode(pool, T, { label: 'Product', name: 'vis-test-product', description: 'x' } as never, Number(runId));
    await setStatus(pool, runId, 'completed');
    // an event nobody handles
    await emitEvent(pool, T, 'PROFILE_COMPLETE', 'agent', { score: 70 }, 'vis-test-profile');
    // a parked run
    const parked = await createRun(pool, T, 'VIS_TEST_PARKED', undefined, {});
    await setStatus(pool, parked, 'awaiting', { awaiting_input: { kind: 'llm_failover_approval', question: 'Spend on Haiku?' } });
    expect(runId).toMatch(/^\d+$/);
  });

  it('runs.list shows the run in the console row shape', async () => {
    const r = await list({}, ctxFor(T));
    const mine = r.runs.find((x) => x.id === runId)!;
    expect(mine).toBeDefined();
    expect(mine.trigger).toBe('URL_SUBMITTED');
    expect(mine.actor).toBe('human');
    expect(mine.steps).toBe(2);
    expect(mine.status).toBe('completed');
    expect(mine.duration).not.toBe('—');
  });

  it('runs.get returns the timeline and what the run changed', async () => {
    const r = await get({ run_id: runId }, ctxFor(T));
    expect(r.run?.id).toBe(runId);
    expect(r.steps).toHaveLength(2);
    expect(r.changed.count).toBeGreaterThanOrEqual(1);
    expect(r.changed.nodes.some((n) => n.name === 'vis-test-product')).toBe(true);
    expect(r.event?.type).toBe('URL_SUBMITTED');
    expect(r.run?.error_trace).toBeNull();   // not an admin
  });

  it('runs.get refuses another tenant the same way as a missing run', async () => {
    const r = await get({ run_id: runId }, ctxFor(OTHER));
    expect(r.run).toBeNull();
    expect(r.reason).toBe('NOT_FOUND');
  });

  it('runs.events marks PROFILE_COMPLETE as unconsumed and URL_SUBMITTED as consumed', async () => {
    const r = await events({}, ctxFor(T));
    const pc = r.events.find((e) => e.event_type === 'PROFILE_COMPLETE' && e.source_type === 'agent');
    const us = r.events.find((e) => e.id === eventId)!;
    expect(pc?.handled).toBe(false);
    expect(r.unconsumed.some((e) => e.event_type === 'PROFILE_COMPLETE')).toBe(true);
    expect(us.handled).toBe(true);
    expect(us.consumed).toBe(true);
    expect(us.run_id).toBe(runId);
  });

  it('runs.awaiting lists the parked run with its question', async () => {
    const r = await awaiting({}, ctxFor(T));
    const p = r.items.find((i) => i.agent === 'VIS_TEST_PARKED')!;
    expect(p.kind).toBe('llm_failover_approval');
    expect(p.question).toBe('Spend on Haiku?');
  });

  it('dashboard.counters counts real rows', async () => {
    const r = await counters({}, ctxFor(T));
    expect(r.runs_today).toBeGreaterThanOrEqual(2);
    expect(r.handovers).toBeGreaterThanOrEqual(1);
    expect(r.detail.unconsumed_events).toBeGreaterThanOrEqual(1);
  });

  it('dashboard.activity says what the last step said', async () => {
    const r = await activity({ limit: 50 }, ctxFor(T));
    const mine = r.activity.find((a) => a.run === runId)!;
    expect(mine.text).toBe('7 nodes');
    expect(mine.agent).toBe('URL_SUBMITTED');
  });

  it('dashboard.brain answers honestly with no profile and with one', async () => {
    const empty = await brain({}, ctxFor(OTHER));
    expect(empty.exists).toBe(false);
    expect(empty.weakest?.key).toBe('research');
    expect(empty.unlocks.storytelling).toBe(false);
    const mine = await brain({}, ctxFor(T));
    // The seeded tenant may or may not have a profile row; either way the shape holds.
    expect(mine.sections).toHaveLength(6);
    expect(mine.sections.reduce((s, x) => s + x.weight, 0)).toBe(100);
  });

  it('agents.list comes from the registry and says which rows are derived', async () => {
    const r = await agentsList({}, ctxFor(T));
    const vara = r.agents.find((a) => a.id === 'vara')!;
    expect(vara.source).toBe('registry');
    expect(['active', 'attention', 'not_activated']).toContain(vara.status);
    expect(r.agents.find((a) => a.id === 'gtm')?.source).toBe('derived');
    expect(r.agents.find((a) => a.id === 'edge')?.source).toBe('derived');
  });

  it('journeys read the tables, and an empty tenant is at the first step', async () => {
    const v = await varaJourney({}, ctxFor(OTHER));
    expect(v.done).toEqual([]);
    expect(v.current).toBe('domain');
    const g = await gtmJourney({}, ctxFor(OTHER));
    expect(g.done).toEqual([]);
    expect(g.current).toBe('profile');
    const gMine = await gtmJourney({}, ctxFor(T));
    expect(Array.isArray(gMine.done)).toBe(true);
    expect(typeof gMine.note).toBe('string');
  });

  it('wrong tenant sees none of the seeded rows', async () => {
    const r = await list({}, ctxFor(OTHER));
    expect(r.runs.find((x) => x.id === runId)).toBeUndefined();
    const e = await events({}, ctxFor(OTHER));
    expect(e.events.find((x) => x.id === eventId)).toBeUndefined();
    const a = await awaiting({}, ctxFor(OTHER));
    expect(a.items.find((i) => i.agent === 'VIS_TEST_PARKED')).toBeUndefined();
  });
});
