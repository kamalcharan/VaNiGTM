/**
 * Domain-pack enrichment, against a real PostgreSQL with the LLM stubbed.
 *
 * What is under test is the CLAIM, not the model's research. A domain pack is
 * PLATFORM data shared by every tenant in an industry, so the interesting
 * failures are all about two tenants racing for the same shared artefact:
 *
 *   - two tenants in one industry produce ONE research run, not two
 *   - a published pack stops the work entirely
 *   - a run killed mid-flight (every deploy does this) does NOT block the
 *     industry forever
 *   - nothing is published without a human
 *
 * The lock tests are the ones that earn their keep, and they are written to
 * BLOCK rather than to race. An earlier version ran two claims through
 * Promise.all and asserted one won — it passed with the advisory lock deleted,
 * because two transactions on separate connections do not reliably interleave
 * on the dangerous path. A race that only sometimes happens makes a test that
 * only sometimes tests. These hold the lock explicitly instead, so removing it
 * from the agent fails them every time.
 *
 * Skips without a database.
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

let llmQueue: unknown[] = [];
jest.mock('../../../agent-core/llm.client', () => ({
  callLLMValidated: jest.fn(async () => {
    if (llmQueue.length === 0) throw new Error('stub LLM: nothing queued');
    return llmQueue.shift();
  }),
}));

import {
  DomainPackAgent, claimDomain, normaliseWeights, toPackRow,
} from '../domain-pack.agent';

/**
 * Only what the agent touches. gt_agent_runs mirrors 162 + 181 + 191;
 * vani_domain_pack and vani_prompt mirror 243 and 245. Built by hand rather
 * than by running 249 migrations, so a failure here points at this agent.
 */
const BASE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
  agent_name VARCHAR(100) NOT NULL, event_id TEXT, status VARCHAR(20) NOT NULL DEFAULT 'queued',
  steps JSONB NOT NULL DEFAULT '[]'::jsonb, inputs JSONB DEFAULT '{}'::jsonb,
  outputs JSONB DEFAULT '{}'::jsonb, checkpoint JSONB, awaiting_input JSONB,
  output JSONB, error_trace TEXT, token_usage JSONB, duration_ms INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE vani_domain_pack (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL, version int NOT NULL DEFAULT 1, domain text NOT NULL,
  payload jsonb NOT NULL, published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version));
CREATE TABLE vani_user (id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE vani_prompt (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL, version int NOT NULL, scope text NOT NULL CHECK (scope IN ('system','tenant')),
  tenant_id uuid, body text NOT NULL, variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false, approved_by uuid REFERENCES vani_user(id),
  approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vani_prompt_scope_shape CHECK (
    (scope = 'system' AND tenant_id IS NULL) OR (scope = 'tenant' AND tenant_id IS NOT NULL)),
  CONSTRAINT vani_prompt_active_needs_approval_ts CHECK (active = false OR approved_at IS NOT NULL),
  UNIQUE (key, scope, tenant_id, version));
CREATE UNIQUE INDEX vani_prompt_one_active ON vani_prompt
  (key, scope, COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE active = true;
`;

const FAMILY = {
  family_name: 'Fleet Operations',
  hint: 'Keeps vehicles moving',
  suggested_titles: ['Fleet Supervisor'],
  role_summary_hint: 'Owns vehicle uptime.',
  musthaves: [
    { name: 'Fleet scheduling', weight: 60, years: 3, why: 'Runs a depot unaided' },
    { name: 'Compliance paperwork', weight: 40, why: 'Keeps vehicles road-legal' },
  ],
  knockouts: [{ label: 'Licence', rule: 'Commercial driving licence held' }],
  threshold: 30,
  band_hint: 'Varies by depot size.',
};

let pool: Pool;

const mkRun = async (tenant = A) => String((await pool.query(
  `INSERT INTO gt_agent_runs (tenant_id, agent_name, status)
   VALUES ($1, 'DOMAIN_ENRICHMENT_REQUESTED', 'running') RETURNING id`, [tenant],
)).rows[0].id);

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS domain_pack_test');
  await admin.query('CREATE DATABASE domain_pack_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'domain_pack_test' });

  await pool.query(BASE);
  // The real migration, not a copy — so a change to the seeded prompt that
  // drops a {{variable}} fails here rather than in production.
  await pool.query(fs.readFileSync(
    path.join(MIGRATIONS, '249_vara_domain_pack_research_prompt.sql'), 'utf8'));
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  llmQueue = [];
  await pool.query('TRUNCATE gt_agent_runs');
  await pool.query('TRUNCATE vani_domain_pack');
});

const d = available ? describe : describe.skip;

d('claiming a domain', () => {
  it('lets exactly one of two tenants in the same industry do the work', async () => {
    // The observable contract in the ordinary case. Note this passes with or
    // without the advisory lock — the two tests below are what pin the lock.
    const [x, y] = await Promise.all([
      claimDomain(pool, await mkRun(A), 'logistics-freight'),
      claimDomain(pool, await mkRun(B), 'logistics-freight'),
    ]);
    expect([x, y].sort()).toEqual(['claimed', 'in-progress']);

    const stamped = await pool.query(
      `SELECT count(*)::int n FROM gt_agent_runs WHERE inputs->>'domain' = 'logistics-freight'`);
    expect(stamped.rows[0].n).toBe(1);
  });

  /**
   * Hold a domain's advisory lock from outside the agent, run `body`, and
   * always give the connection back.
   *
   * The release MUST be in a finally. The first version of these tests let an
   * assertion throw past it, which left an open transaction holding the lock
   * on a pooled client — so `pool.end()` in afterAll never resolved and the
   * whole suite HUNG instead of reporting the failure. Verified: with the
   * agent's lock line deleted, that version timed out with no output at all.
   * A test that hangs when the code is wrong is barely better than one that
   * passes when the code is wrong.
   */
  async function holdingLockOn(slug: string, body: () => Promise<void>): Promise<void> {
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      await blocker.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`domain-pack:${slug}`]);
      await body();
    } finally {
      await blocker.query('ROLLBACK').catch(() => {});
      blocker.release();
    }
  }

  it('waits for a claim already in progress on the same industry', async () => {
    // Deterministic, not a race: delete pg_advisory_xact_lock from the agent
    // and this fails every run.
    //
    // The blocked claim is awaited OUTSIDE holdingLockOn on purpose. Returning
    // it through the helper deadlocks — the helper would await a promise that
    // cannot resolve until its own finally releases the lock. That cost a hung
    // suite twice; the helper's body returns void so it cannot happen again.
    const run = await mkRun(A);
    let settled = false;
    let claim!: Promise<unknown>;

    await holdingLockOn('steel', async () => {
      claim = claimDomain(pool, run, 'steel').then((r) => { settled = true; return r; });
      await new Promise((r) => setTimeout(r, 300));
      expect(settled).toBe(false);   // still blocked on the lock
    });

    expect(await claim).toBe('claimed');
  });

  it('does not make one industry wait on another', async () => {
    // The control. A lock on a constant instead of the slug would pass the
    // test above while serialising every industry behind a single queue.
    const run = await mkRun(A);
    let claimed: unknown;
    await holdingLockOn('steel', async () => {
      claimed = await claimDomain(pool, run, 'hospitality');
    });
    expect(claimed).toBe('claimed');
  });

  it('does no work when a pack is already published', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-healthcare-nursing', 1, 'healthcare',
               '{"vara":{"starter":{"musthaves":[]}}}'::jsonb)`);
    expect(await claimDomain(pool, await mkRun(), 'healthcare')).toBe('pack-exists');
  });

  it("ignores another agent's pack for the same domain", async () => {
    // vani_domain_pack is shared across agents and namespaced by payload key.
    // A survey pack for retail says nothing about whether Vara has one.
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('survey-retail', 1, 'retail', '{"survey":{"bank":[]}}'::jsonb)`);
    expect(await claimDomain(pool, await mkRun(), 'retail')).toBe('claimed');
  });

  it('retries an industry whose run died mid-flight', async () => {
    // Every deploy restarts the worker and orphans in-flight runs; the queue
    // has no stale-row reclaim. Without the age bound one dead run would
    // block its industry permanently.
    const dead = await mkRun();
    await claimDomain(pool, dead, 'mining');
    expect(await claimDomain(pool, await mkRun(), 'mining')).toBe('in-progress');

    await pool.query(
      `UPDATE gt_agent_runs SET started_at = now() - interval '90 minutes' WHERE id = $1`, [dead]);
    expect(await claimDomain(pool, await mkRun(), 'mining')).toBe('claimed');
  });

  it('is not blocked by a run that already finished', async () => {
    const done = await mkRun();
    await claimDomain(pool, done, 'retail');
    await pool.query(`UPDATE gt_agent_runs SET status = 'completed' WHERE id = $1`, [done]);
    expect(await claimDomain(pool, await mkRun(), 'retail')).toBe('claimed');
  });
});

d('the agent', () => {
  it('parks for review instead of publishing', async () => {
    llmQueue = [{ families: [FAMILY] }];
    const run = await mkRun();
    await DomainPackAgent.run(pool, A, { industry: 'Logistics & Freight', domain: 'logistics-freight' }, run);

    const r = await pool.query(
      `SELECT status, awaiting_input, output FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('awaiting');
    expect(r.rows[0].awaiting_input.kind).toBe('domain_pack_review');
    expect(r.rows[0].awaiting_input.packs).toHaveLength(1);

    // The point of the gate: research alone publishes nothing.
    const published = await pool.query(`SELECT count(*)::int n FROM vani_domain_pack`);
    expect(published.rows[0].n).toBe(0);
  });

  it('completes without calling the model when a pack exists', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-healthcare-nursing', 1, 'healthcare',
               '{"vara":{"starter":{"musthaves":[]}}}'::jsonb)`);
    const run = await mkRun();
    // llmQueue is empty — the stub throws if the agent reaches the model.
    await DomainPackAgent.run(pool, A, { industry: 'Healthcare', domain: 'healthcare' }, run);

    const r = await pool.query(`SELECT status, output FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('completed');
    expect(r.rows[0].output.skipped).toBe('pack-exists');
  });

  it('fails loudly when the event carries no industry', async () => {
    // Completing quietly here would read as "this industry has no families",
    // which is the silent-degradation shape rule 12 forbids.
    await expect(
      DomainPackAgent.run(pool, A, { industry: '   ' }, await mkRun()),
    ).rejects.toThrow(/DOMAIN_ENRICHMENT_NO_INDUSTRY/);
  });

  it('renders the seeded prompt with no tokens left unsubstituted', async () => {
    const p = await pool.query(
      `SELECT body, variables FROM vani_prompt WHERE key = 'vara.domain_pack.research'`);
    const declared: string[] = p.rows[0].variables;
    const inBody = [...String(p.rows[0].body).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    // Both directions: an undeclared token renders literally to the model; a
    // declared-but-absent one makes every tenant override fail validation.
    expect(new Set(inBody)).toEqual(new Set(declared));
  });
});

d('publishing a reviewed draft', () => {
  // publish.ts opens its own pool from DB_PRIMARY at import time, and require
  // caches the module — so it is loaded and closed ONCE for the whole block.
  // Loading per test looked tidier and failed: the first close() ended the
  // shared pool and every later test died on "Cannot use a pool after end".
  let pub: typeof import('../publish');

  beforeAll(() => {
    if (!available) return;
    process.env.DB_PRIMARY =
      `postgresql://${process.env.PGUSER || 'postgres'}@localhost/domain_pack_test`
      + `?host=${process.env.PGHOST || '/tmp'}&port=${process.env.PGPORT || 55432}`;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    pub = require('../publish');
  });

  afterAll(async () => { if (pub) await pub.close(); });

  const draft = async () => {
    llmQueue = [{ families: [FAMILY, { ...FAMILY, family_name: 'Warehouse Ops' }] }];
    const run = await mkRun();
    await DomainPackAgent.run(pool, A, { industry: 'Logistics', domain: 'logistics' }, run);
    return run;
  };

  it('publishes every family of a draft, at version 1', async () => {
    const run = await draft();
    const published = await pub.publish(run);
    expect(published).toHaveLength(2);

    const rows = await pool.query(
      `SELECT code, version, domain FROM vani_domain_pack ORDER BY code`);
    expect(rows.rows.map((r) => r.version)).toEqual([1, 1]);
    expect(rows.rows.map((r) => r.domain)).toEqual(['logistics', 'logistics']);

    const r = await pool.query(`SELECT status, awaiting_input FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('completed');
    expect(r.rows[0].awaiting_input).toBeNull();
  });

  it('refuses a second publish instead of duplicating the packs', async () => {
    const run = await draft();
    await pub.publish(run);
    await expect(pub.publish(run)).rejects.toThrow(/nothing to publish/);
    const n = await pool.query(`SELECT count(*)::int n FROM vani_domain_pack`);
    expect(n.rows[0].n).toBe(2);
  });

  it('never overwrites — a re-publish is a new version', async () => {
    // V-14 append-only. Anything that recorded "pack v1" must still be able
    // to read v1 after a correction lands.
    //
    // The second draft is written directly rather than produced by the agent,
    // and that is a FINDING, not a test convenience: once v1 is published,
    // claimDomain answers 'pack-exists' for that industry forever, so the
    // agent cannot currently produce a refreshed draft at all. Versioning
    // works; nothing triggers it. Refreshing a stale pack needs a deliberate
    // path (an operator re-research flag, or an age check in the claim) and
    // is not built — see the commit message.
    const first = await draft();
    await pub.publish(first);

    const reDraft = await pool.query(
      `INSERT INTO gt_agent_runs (tenant_id, agent_name, status, awaiting_input)
       VALUES ($1, 'DOMAIN_ENRICHMENT_REQUESTED', 'awaiting', $2::jsonb) RETURNING id`,
      [A, JSON.stringify({
        kind: 'domain_pack_review', domain: 'logistics', industry: 'Logistics',
        researched_at: new Date().toISOString(), prompt_version: 1,
        packs: [toPackRow('logistics', FAMILY as never, 'Logistics', 1)],
      })],
    );

    const published = await pub.publish(String(reDraft.rows[0].id));
    expect(published).toEqual(['talent-logistics-fleet-operations v2']);

    const versions = await pool.query(
      `SELECT version FROM vani_domain_pack
        WHERE code = 'talent-logistics-fleet-operations' ORDER BY version`);
    expect(versions.rows.map((r) => r.version)).toEqual([1, 2]);
  });

  it('publishes all families or none', async () => {
    // The second family's INSERT must fail AFTER the first has succeeded, so
    // a constraint is added for the duration. An earlier version of this test
    // pre-inserted a clashing row and proved nothing: publish computes
    // max(version)+1, so the clash just produced v2 and everything succeeded.
    const run = await draft();
    await pool.query(
      `ALTER TABLE vani_domain_pack ADD CONSTRAINT tmp_block_warehouse
         CHECK (code <> 'talent-logistics-warehouse-ops')`);
    try {
      await expect(pub.publish(run)).rejects.toThrow();

      // The first family must not survive the second's failure. A tenant
      // seeing some role families with nothing saying the rest are missing is
      // worse than seeing none.
      const orphan = await pool.query(
        `SELECT count(*)::int n FROM vani_domain_pack
          WHERE code = 'talent-logistics-fleet-operations'`);
      expect(orphan.rows[0].n).toBe(0);

      // And the draft is still reviewable — a failed publish must not consume it.
      const r = await pool.query(`SELECT status FROM gt_agent_runs WHERE id = $1`, [run]);
      expect(r.rows[0].status).toBe('awaiting');
    } finally {
      await pool.query(`ALTER TABLE vani_domain_pack DROP CONSTRAINT tmp_block_warehouse`);
    }
  });

  it('frees the industry again when a draft is rejected', async () => {
    const run = await draft();
    await pub.reject(run, 'families are generic');

    const r = await pool.query(`SELECT status, error_trace FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('failed');
    expect(r.rows[0].error_trace).toMatch(/generic/);

    // The point of rejecting: a bad draft must be re-researchable, not a
    // permanent block on the industry.
    expect(await claimDomain(pool, await mkRun(), 'logistics')).toBe('claimed');
  });
});

describe('musthave weights', () => {
  it.each([
    [[40, 25, 20, 15]], [[30, 30, 30]], [[50, 50, 44]], [[1, 1, 1]], [[33, 33, 33]],
  ])('forces %j to sum to 100', (weights) => {
    const out = normaliseWeights({
      ...FAMILY, musthaves: weights.map((w, i) => ({ name: `m${i}`, weight: w })),
    } as never);
    expect(out.musthaves.reduce((s, m) => s + m.weight, 0)).toBe(100);
  });

  it('leaves an already-valid set untouched', () => {
    const out = normaliseWeights({
      ...FAMILY,
      musthaves: [{ name: 'a', weight: 60 }, { name: 'b', weight: 40 }],
    } as never);
    expect(out.musthaves.map((m) => m.weight)).toEqual([60, 40]);
  });
});

describe('pack rows', () => {
  it('match the handcrafted shape in migration 244', () => {
    const row = toPackRow('logistics-freight', FAMILY as never, 'Logistics & Freight', 1);
    expect(row.code).toBe('talent-logistics-freight-fleet-operations');
    expect(row.domain).toBe('logistics-freight');
    expect(row.payload.vara.starter.musthaves).toHaveLength(2);
    expect(row.payload.vara.starter.window_days).toBe(3);
    // Packs are append-only and versioned; without a date nobody can tell a
    // four-year-old pack from a fresh one.
    expect(row.payload.researched.at).toBeTruthy();
    expect(row.payload.researched.prompt_key).toBe('vara.domain_pack.research');
  });

  it('carries years and why through to the pack', () => {
    // The two fields Charan asked for. 244's handcrafted packs have neither,
    // and the consumer reads name/weight, so they ride along harmlessly until
    // the scorer is taught to use them.
    const row = toPackRow('logistics-freight', FAMILY as never, 'Logistics & Freight', 1);
    const [first] = row.payload.vara.starter.musthaves;
    expect(first.years).toBe(3);
    expect(first.why).toBe('Runs a depot unaided');
  });
});
