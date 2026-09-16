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
import { createTenantDb } from '../../../db';
import { matchTitle } from '../title-match';
import { assertNoTemplateLeak } from '../domain-pack.agent';
import path from 'path';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

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
CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $fn$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $fn$ LANGUAGE plpgsql;
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE vn_tenant_profiles (tenant_id UUID PRIMARY KEY REFERENCES vn_tenants(id),
  industry VARCHAR(200), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id), event_type VARCHAR(80) NOT NULL,
  source_type VARCHAR(30) NOT NULL, source_id TEXT, payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', processed_at TIMESTAMPTZ, error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
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

/** Stage 2 returns only the scoring half; the stub must answer both stages. */
const STARTER_OF = (f: typeof FAMILY) => ({
  musthaves: f.musthaves, knockouts: f.knockouts,
  threshold: f.threshold, band_hint: f.band_hint,
});

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
  // The real migrations, not copies — so a prompt edit that drops a
  // {{variable}} fails here rather than in production. 250 supersedes 249's
  // row, and the token-contract test below therefore checks whichever version
  // is ACTIVE, which is the one the agent will actually resolve.
  for (const m of ['249_vara_domain_pack_research_prompt.sql',
                   '250_vara_domain_pack_research_prompt_v2.sql',
                   '251_vara_domain_pack_two_stage.sql',
                   '252_vara_starter_prompt_v2.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
  await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1,'us'), ($2,'them'), ($3,'saas')`,
    [A, B, C]);
  await pool.query(
    `INSERT INTO vn_tenant_profiles (tenant_id, industry)
     VALUES ($1,'Logistics & Freight'), ($2,'   '), ($3,'Technology & SaaS')`,
    [A, B, C]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  llmQueue = [];
  await pool.query('TRUNCATE gt_agent_runs');
  await pool.query('TRUNCATE vani_domain_pack');
  await pool.query('TRUNCATE gt_events');
});

const d = available ? describe : describe.skip;

// publish.ts opens its own pool from DB_PRIMARY at import time, and require
// caches the module — so it is loaded and closed ONCE for the whole file.
// Loading it per test looked tidier and failed: the first close() ended the
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
       VALUES ('talent-healthcare-nursing', 1, 'healthcare', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);
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
    llmQueue = [{ families: [FAMILY] }, STARTER_OF(FAMILY)];
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

  it('keeps the families it already paid for when a later one fails', async () => {
    // The reason research is two-staged at all. Run 87 asked for everything in
    // one call, produced 10,317 characters and truncated at 10,302 — and the
    // whole run was lost. Now each family is written to the checkpoint as it
    // lands, so a failure on the second keeps the first.
    const run = await mkRun();
    // Stage 1 names two families; stage 2 answers for the first and then the
    // stub runs dry, which is what a timeout looks like from here.
    llmQueue = [
      { families: [FAMILY, { ...FAMILY, family_name: 'Warehouse Ops' }] },
      STARTER_OF(FAMILY),
    ];
    await expect(
      DomainPackAgent.run(pool, A, { industry: 'Logistics', domain: 'logistics' }, run),
    ).rejects.toThrow();

    const cp = await pool.query(`SELECT checkpoint FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(cp.rows[0].checkpoint.families).toHaveLength(2);
    expect(Object.keys(cp.rows[0].checkpoint.shapes)).toEqual(['Fleet Operations']);
  });

  it('resumes from the checkpoint instead of re-asking the model', async () => {
    const run = await mkRun();
    llmQueue = [
      { families: [FAMILY, { ...FAMILY, family_name: 'Warehouse Ops' }] },
      STARTER_OF(FAMILY),
    ];
    await expect(
      DomainPackAgent.run(pool, A, { industry: 'Logistics', domain: 'logistics' }, run),
    ).rejects.toThrow();

    // Exactly ONE response queued: enough for the missing family and nothing
    // else. If the agent re-ran stage 1 or re-shaped the first family, the
    // stub would run dry and this would throw.
    llmQueue = [STARTER_OF({ ...FAMILY, family_name: 'Warehouse Ops' } as never)];
    await DomainPackAgent.run(pool, A, { industry: 'Logistics', domain: 'logistics' }, run);

    const r = await pool.query(
      `SELECT status, awaiting_input, steps FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('awaiting');
    expect(r.rows[0].awaiting_input.packs).toHaveLength(2);
    // A visible restore step, so a resumed run is legible in the feed rather
    // than looking like it did less work for no reason.
    expect(JSON.stringify(r.rows[0].steps)).toMatch(/Resumed 2 families from checkpoint/);
  });

  it('completes without calling the model when a pack exists', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-healthcare-nursing', 1, 'healthcare', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);
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

  it.each([
    ['vara.domain_pack.families'],
    ['vara.domain_pack.starter'],
  ])('%s declares exactly the variables its body uses', async (key) => {
    const p = await pool.query(
      `SELECT body, variables FROM vani_prompt WHERE key = $1 AND active = true`, [key]);
    expect(p.rows).toHaveLength(1);        // one active row per key, per the partial index
    const declared: string[] = p.rows[0].variables;
    const inBody = [...String(p.rows[0].body).matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    // Both directions: an undeclared token renders literally to the model; a
    // declared-but-absent one makes every tenant override fail validation.
    expect(new Set(inBody)).toEqual(new Set(declared));
  });

  it('retires the single-call prompt rather than leaving two claiming the job', async () => {
    // 251 splits research in two because one call truncated at 10,302 chars.
    // Leaving vara.domain_pack.research active would mean nobody could tell
    // which prompt actually runs.
    const r = await pool.query(
      `SELECT count(*)::int n FROM vani_prompt
        WHERE key = 'vara.domain_pack.research' AND active = true`);
    expect(r.rows[0].n).toBe(0);
    // Still readable: published packs record the version that produced them.
    const kept = await pool.query(
      `SELECT count(*)::int n FROM vani_prompt WHERE key = 'vara.domain_pack.research'`);
    expect(kept.rows[0].n).toBe(2);
  });
});

d('publishing a reviewed draft', () => {
  const draft = async () => {
    llmQueue = [
      { families: [FAMILY, { ...FAMILY, family_name: 'Warehouse Ops' }] },
      STARTER_OF(FAMILY), STARTER_OF(FAMILY),
    ];
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

d('research on demand', () => {
  // The automatic trigger fires only on the business_profile step, so every
  // tenant who onboarded before it shipped is unreachable without this.
  it('emits the same event the onboarding step emits', async () => {
    const r = await pub.research(A);
    expect(r.domain).toBe('logistics-freight');
    expect(r.industry).toBe('Logistics & Freight');

    const ev = await pool.query(
      `SELECT event_type, source_type, status, payload FROM gt_events WHERE id = $1`, [r.eventId]);
    expect(ev.rows[0].event_type).toBe('DOMAIN_ENRICHMENT_REQUESTED');
    expect(ev.rows[0].status).toBe('pending');          // the worker will claim it
    expect(ev.rows[0].payload.domain).toBe('logistics-freight');
    expect(ev.rows[0].payload.force).toBe(false);
  });

  it('refuses a tenant with no industry instead of guessing one', async () => {
    // Rule 9d. Inventing an industry here would produce packs for a business
    // nobody described, and every tenant in that slug would inherit them.
    await expect(pub.research(B)).rejects.toThrow(/no industry set/i);
    const n = await pool.query(`SELECT count(*)::int n FROM gt_events`);
    expect(n.rows[0].n).toBe(0);
  });

  it('is a safe no-op when packs already exist', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-x', 1, 'logistics-freight', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);
    // Emitting is cheap and always allowed; the claim is what decides.
    await pub.research(A);
    expect(await claimDomain(pool, await mkRun(), 'logistics-freight')).toBe('pack-exists');
  });

  it('--force re-researches an industry whose packs are stale', async () => {
    // The refresh gap. Without force, claimDomain answers 'pack-exists'
    // forever and a stale pack can never be replaced.
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-x', 1, 'logistics-freight', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);

    const r = await pub.research(A, true);
    const ev = await pool.query(`SELECT payload FROM gt_events WHERE id = $1`, [r.eventId]);
    expect(ev.rows[0].payload.force).toBe(true);

    expect(await claimDomain(pool, await mkRun(), 'logistics-freight', true)).toBe('claimed');
  });

  it('force still will not let two runs research the same industry at once', async () => {
    // force skips the pack check ONLY. Losing the in-flight guard too would
    // let an operator double-run an expensive job by pressing twice.
    const first = await mkRun();
    expect(await claimDomain(pool, first, 'logistics-freight', true)).toBe('claimed');
    expect(await claimDomain(pool, await mkRun(), 'logistics-freight', true)).toBe('in-progress');
  });

  it('force publishes nothing by itself — the draft still needs review', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-x', 1, 'logistics-freight', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);
    llmQueue = [{ families: [FAMILY] }, STARTER_OF(FAMILY)];
    const run = await mkRun();
    await DomainPackAgent.run(
      pool, A, { industry: 'Logistics & Freight', domain: 'logistics-freight', force: true }, run);

    const r = await pool.query(`SELECT status FROM gt_agent_runs WHERE id = $1`, [run]);
    expect(r.rows[0].status).toBe('awaiting');
    const n = await pool.query(`SELECT count(*)::int n FROM vani_domain_pack`);
    expect(n.rows[0].n).toBe(1);        // still only the stale one
  });
});

d('a seeded pack is not research', () => {
  // Migration 244 handwrote three packs for 'technology-saas' in August,
  // before any tenant existed. The doorway showed them as knowledge, which is
  // how a Customer Success hire got PostgreSQL + RLS at 40wt.
  const SEEDED = `'{"family_name":"Backend Engineering","vara":{"starter":{"musthaves":[]}}}'::jsonb`;

  it('still researches an industry that only has Vikuna starter packs', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-seed', 1, 'logistics-freight', ${SEEDED})`);
    expect(await claimDomain(pool, await mkRun(), 'logistics-freight')).toBe('claimed');
  });

  it('stops once a researched pack is published', async () => {
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-seed', 1, 'logistics-freight', ${SEEDED}),
              ('talent-logistics-freight-real', 1, 'logistics-freight',
               '{"vara":{"starter":{}},"researched":{"at":"2026-09-16T00:00:00Z"}}'::jsonb)`);
    expect(await claimDomain(pool, await mkRun(), 'logistics-freight')).toBe('pack-exists');
  });

  it('tells the tenant the families are a generic starter set', async () => {
    // seeded_only is invisible to any empty-state check — the list has three
    // families in it. That is precisely why it went unnoticed.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { research_status } = require('../functions/research-status');
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-seed', 1, 'logistics-freight', ${SEEDED})`);

    const st = await research_status({}, {
      tenant_id: A, is_live: false, user_id: null, db: createTenantDb(pool, A),
    } as never);
    expect(st.state).toBe('seeded_only');
    expect(st.source).toBe('seeded');
    expect(st.families).toBe(1);
    expect(st.can_request).toBe(true);           // the tenant can ask for real research
    expect(st.detail).toMatch(/generic starter/i);
  });

  it("does not offer research while a draft is waiting on review", async () => {
    // An awaiting run is not stuck, it is waiting on a human. Offering the
    // button would queue the same industry again every time someone looked.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { research_status } = require('../functions/research-status');
    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-seed', 1, 'logistics-freight', ${SEEDED})`);
    await pool.query(
      `INSERT INTO gt_agent_runs (tenant_id, agent_name, status, inputs)
       VALUES ($1,'DOMAIN_ENRICHMENT_REQUESTED','awaiting','{"domain":"logistics-freight"}'::jsonb)`,
      [A]);

    const st = await research_status({}, {
      tenant_id: A, is_live: false, user_id: null, db: createTenantDb(pool, A),
    } as never);
    expect(st.state).toBe('in_review');
    expect(st.can_request).toBe(false);
  });

  it('an awaiting draft blocks a re-research no matter how old it is', async () => {
    // queued/running age out because a deploy orphans them. awaiting does not:
    // ageing it out would re-research the industry hourly until someone
    // reviewed the first draft.
    const drafted = await mkRun();
    await claimDomain(pool, drafted, 'mining');
    await pool.query(
      `UPDATE gt_agent_runs SET status = 'awaiting',
              started_at = now() - interval '30 days' WHERE id = $1`, [drafted]);
    expect(await claimDomain(pool, await mkRun(), 'mining')).toBe('in-progress');
  });
});

d('the tenant-facing skill', () => {
  // Charan, 2026-09-16: "there needs to be alternative to run it .. just
  // because it has failed, does not mean to fail — in Vara we can have a
  // research button and let it run."
  //
  // Rule 12 allows exactly this: an explicit user-chosen retry offered AFTER
  // a visible failure with the real diagnosis. research_status is the
  // diagnosis; request_research is the action.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fns = () => ({
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    status: require('../functions/research-status').research_status,
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    request: require('../functions/request-research').request_research,
  });
  const ctxFor = (tenant: string) => ({
    tenant_id: tenant, is_live: false, user_id: null,
    db: createTenantDb(pool, tenant),
  } as never);

  it('names each reason a role-family list can be empty', async () => {
    // One blank screen for five causes is the failure rule 9b exists to stop:
    // "set an industry", "wait", and "retry" are different actions.
    const { status } = fns();

    expect((await status({}, ctxFor(A))).state).toBe('none');

    await pool.query(
      `INSERT INTO gt_agent_runs (tenant_id, agent_name, status)
       VALUES ($1,'DOMAIN_ENRICHMENT_REQUESTED','running')`, [A]);
    expect((await status({}, ctxFor(A))).state).toBe('running');

    await pool.query(`UPDATE gt_agent_runs SET status = 'awaiting'`);
    expect((await status({}, ctxFor(A))).state).toBe('in_review');

    await pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ('talent-logistics-freight-a',1,'logistics-freight', '{"vara":{"starter":{"musthaves":[]}},"researched":{"at":"2026-09-16T00:00:00Z","by":"domain-pack-agent"}}'::jsonb)`);
    const ready = await status({}, ctxFor(A));
    expect(ready.state).toBe('ready');
    expect(ready.families).toBe(1);
  });

  it('surfaces the real failure and offers a retry, without leaking a stack', async () => {
    const { status } = fns();
    await pool.query(
      `INSERT INTO gt_agent_runs (tenant_id, agent_name, status, error_trace)
       VALUES ($1,'DOMAIN_ENRICHMENT_REQUESTED','failed',
               'LLM_VALIDATION_FAILED: model returned no JSON\n  at parse (llm.ts:12)')`, [A]);
    const s = await status({}, ctxFor(A));
    expect(s.state).toBe('failed');
    expect(s.can_request).toBe(true);                    // the retry Charan asked for
    expect(s.detail).toContain('LLM_VALIDATION_FAILED'); // the real cause, not "something went wrong"
    expect(s.detail).not.toContain('llm.ts');            // frames stay server-side
  });

  it('queues a retry as a human-sourced event, never forced', async () => {
    const { request } = fns();
    const r = await request({}, ctxFor(A));
    expect(r.queued).toBe(true);

    const ev = await pool.query(`SELECT source_type, payload FROM gt_events`);
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0].source_type).toBe('human');
    // force skips the pack-exists guard on a SHARED artefact. Operator-only.
    expect(ev.rows[0].payload.force).toBe(false);
  });

  it('refuses a tenant with no industry rather than inventing one', async () => {
    const { request, status } = fns();
    expect((await status({}, ctxFor(B))).state).toBe('no_industry');
    const r = await request({}, ctxFor(B));
    expect(r.queued).toBe(false);
    expect(r.reason).toBe('NO_INDUSTRY');
    expect((await pool.query(`SELECT count(*)::int n FROM gt_events`)).rows[0].n).toBe(0);
  });

  it('ignores an industry or force flag supplied in params', async () => {
    // The industry comes from vn_tenant_profiles via the JWT's tenant_id.
    // Honouring params would let any caller research — and so shape — an
    // industry they do not belong to.
    const { request } = fns();
    const r = await request({ industry: 'Defence', domain: 'defence', force: true }, ctxFor(B));
    expect(r.queued).toBe(false);
    expect((await pool.query(`SELECT count(*)::int n FROM gt_events`)).rows[0].n).toBe(0);
  });

  it('is registered, so the console reaches it through the generic runner', async () => {
    // No entry in vani-app's PLATFORM_ROUTES — that exception table stays small.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { loadAllSkills } = require('../../../services/skill-loader');
    const skill = loadAllSkills(path.resolve(__dirname, '../../'))
      .find((sk: { name: string }) => sk.name === 'domain-pack-skill');
    expect(skill).toBeTruthy();
    // Declared in SKILL.md's ## Functions as ### blocks — a table renders fine
    // and registers nothing, which is how this shipped undiscoverable once.
    expect(skill.functions.map((f: { name: string }) => f.name).sort())
      .toEqual(['match_title', 'request_research', 'research_status']);
  });
});

d('matching a typed title to a starter shape', () => {
  // The 70% path. Charan: a browse-the-pack screen serves the 30% who look;
  // everyone else types a title and starts talking, so enrichment has to pay
  // off there. Seeded packs are migration 244's; researched ones carry
  // payload.researched.
  const SEED = (code: string, family: string, titles: string[]) =>
    pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ($1, 1, 'technology-saas', $2::jsonb)`,
      [code, JSON.stringify({
        family_name: family, suggested_titles: titles,
        vara: { starter: { musthaves: [{ name: 'seeded', weight: 100 }] } },
      })]);

  const RESEARCHED = (code: string, family: string, titles: string[]) =>
    pool.query(
      `INSERT INTO vani_domain_pack (code, version, domain, payload)
       VALUES ($1, 1, 'technology-saas', $2::jsonb)`,
      [code, JSON.stringify({
        family_name: family, suggested_titles: titles,
        vara: { starter: { musthaves: [{ name: 'researched', weight: 100 }] } },
        researched: { at: '2026-09-16T00:00:00Z', by: 'domain-pack-agent' },
      })]);

  const call = (title: string) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { match_title } = require('../functions/match-title');
    return match_title({ title }, {
      tenant_id: C, is_live: false, user_id: null, db: createTenantDb(pool, C),
    } as never);
  };

  beforeEach(async () => {
    await SEED('talent-technology-saas-backend-eng', 'Backend Engineering',
      ['Senior Backend Engineer', 'Staff Backend Engineer', 'Backend Tech Lead']);
    await SEED('talent-technology-saas-product-design', 'Product & Design',
      ['Senior Product Designer', 'Product Manager']);
  });

  it('matches the title a hiring manager actually types', async () => {
    const r = await call('Senior Backend Engineer');
    expect(r.matched).toBe(true);
    expect(r.family_name).toBe('Backend Engineering');
    expect(r.score).toBe(100);
    expect(r.starter.musthaves[0].name).toBe('seeded');
  });

  it('refuses to guess for a role no family covers', async () => {
    // THE bug this whole thread started from: a Customer Success JD inherited
    // an engineering playbook and published with PostgreSQL + RLS at 40%.
    // Silence is the correct answer; the nearest family is not (rule 9d).
    const r = await call('Customer Success Manager');
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('NO_FAMILY_MATCH');
    expect(r.detail).toMatch(/from scratch/i);
  });

  it('survives how people really write titles', async () => {
    // Hyphens, seniority, and a bracketed suffix are the three most common
    // ways a typed title differs from a pack title.
    for (const typed of ['Back-end Engineer', 'backend engineer', 'Staff Backend Engineer (Remote)']) {
      const r = await call(typed);
      expect([typed, r.matched]).toEqual([typed, true]);
      expect(r.family_name).toBe('Backend Engineering');
    }
  });

  it('matches on the family name when the titles list misses it', async () => {
    await RESEARCHED('talent-technology-saas-data-eng', 'Data Engineering', ['ETL Developer']);
    const r = await call('Data Engineer');
    expect(r.matched).toBe(true);
    expect(r.family_name).toBe('Data Engineering');
  });

  it('prefers a researched pack over a seed on equal evidence', async () => {
    // Both carry the exact title. The researched one was produced for this
    // industry; the seed was handwritten before any tenant existed.
    await RESEARCHED('talent-technology-saas-software-eng', 'Software Engineering',
      ['Senior Backend Engineer']);
    const r = await call('Senior Backend Engineer');
    expect(r.matched).toBe(true);
    expect(r.researched).toBe(true);
    expect(r.family_name).toBe('Software Engineering');
    expect(r.starter.musthaves[0].name).toBe('researched');
  });

  it('says so, distinctly, when the shape is only a starter', async () => {
    const r = await call('Senior Backend Engineer');
    expect(r.researched).toBe(false);
    expect(r.detail).toMatch(/not researched/i);
  });

  it('refuses without an industry rather than matching across all of them', async () => {
    // B has a blank industry. Matching globally would hand a logistics tenant
    // a SaaS playbook.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { match_title } = require('../functions/match-title');
    const r = await match_title({ title: 'Senior Backend Engineer' }, {
      tenant_id: B, is_live: false, user_id: null, db: createTenantDb(pool, B),
    } as never);
    expect(r.matched).toBe(false);
    expect(r.reason).toBe('NO_INDUSTRY');
  });
});

describe('title matching, measured against real pack titles', () => {
  // Migration 244's handwritten titles plus run 86's first real research
  // output, verbatim. This table IS the spec: it was produced by running the
  // matcher over them, and every row that changed the code is commented.
  const PACKS = [
    { pack_code: 'seed-backend', pack_version: 1, family_name: 'Backend Engineering',
      researched: false, starter: {},
      suggested_titles: ['Senior Backend Engineer', 'Staff Backend Engineer', 'Backend Tech Lead'] },
    { pack_code: 'seed-frontend', pack_version: 1, family_name: 'Frontend Engineering',
      researched: false, starter: {},
      suggested_titles: ['Senior Frontend Engineer', 'Frontend Tech Lead', 'Product Engineer'] },
    { pack_code: 'seed-proddes', pack_version: 1, family_name: 'Product & Design',
      researched: false, starter: {},
      suggested_titles: ['Senior Product Designer', 'Product Manager'] },
    { pack_code: 'res-swe', pack_version: 1, family_name: 'Software Engineering',
      researched: true, starter: {},
      suggested_titles: ['Software Engineer', 'Full Stack Developer', 'Back-end Developer'] },
    { pack_code: 'res-data', pack_version: 1, family_name: 'Data Engineering',
      researched: true, starter: {},
      suggested_titles: ['Data Engineer', 'Data Pipeline Engineer', 'ETL Developer'] },
    { pack_code: 'res-pm', pack_version: 1, family_name: 'Product Management',
      researched: true, starter: {},
      suggested_titles: ['Product Manager', 'Product Owner', 'SaaS Product Manager'] },
  ];
  const of = (t: string) => matchTitle(t, PACKS as never).matched?.family_name ?? null;

  it.each([
    ['Senior Backend Engineer',     'Backend Engineering'],
    ['Back-end Engineer (Remote)',  'Backend Engineering'],
    ['Staff Software Engineer',     'Software Engineering'],
    ['Senior Data Engineer',        'Data Engineering'],
    ['ETL Developer',               'Data Engineering'],
    ['Senior Product Designer',     'Product & Design'],
    // These two matched NOTHING until engineer/developer became synonyms —
    // both are titles a hiring manager types constantly, and a Frontend
    // Engineering family was sitting right there unmatched.
    ['Frontend Developer',          'Frontend Engineering'],
    ['Full Stack Engineer',         'Software Engineering'],
  ])('%s -> %s', (typed, family) => expect(of(typed)).toBe(family));

  it.each([
    // The bug that started all of this. A near-match here published a
    // Customer Success JD with PostgreSQL + RLS at 40% weight.
    ['Customer Success Manager'],
    ['Account Executive'],
    ['Office Administrator'],
    ['Chief Financial Officer'],
    ['Nurse Practitioner'],
    // Real engineering roles the pack genuinely lacks a family for. Silence
    // is right: the fix is more families in the pack, never a looser floor.
    ['SRE'],
    ['DevOps Engineer'],
    ['QA Engineer'],
  ])('%s -> no match', (typed) => expect(of(typed)).toBeNull());

  it('prefers researched on a tie, and offers the runner-up as an alternate', () => {
    // Both Product & Design and Product Management carry "Product Manager"
    // exactly. The researched one wins; the other is still offered.
    const r = matchTitle('Lead Product Manager', PACKS as never);
    expect(r.matched!.family_name).toBe('Product Management');
    expect(r.matched!.researched).toBe(true);
    expect(r.alternates.map((a) => a.family_name)).toContain('Product & Design');
  });
});

describe('a template copied across families', () => {
  // Run 90: eight good families, and "Owns a service in production / Can be
  // paged at 2am and resolve it unaided" as the TOP-WEIGHTED must-have in six
  // of them — including Product Management, Customer Success and Technical
  // Support. Copied verbatim out of the prompt's own example of a good `why`.
  //
  // The prompt is fixed too (252), but a model that copies will find something
  // else to copy, so this check is what actually holds.
  const fam = (name: string, musthaves: { name: string; weight: number }[]) => ({
    family_name: name, suggested_titles: [], knockouts: [], threshold: 30, musthaves,
  } as never);

  const LEAK = { name: 'Owns a service in production', weight: 31 };
  const own = (n: string) => ({ name: `${n} specific signal`, weight: 69 });

  it('refuses the draft, naming the phrase and where it appears', () => {
    const families = ['Software Development', 'Data Engineering', 'DevOps',
                      'Product Management', 'Customer Success', 'Technical Support',
                      'Security', 'Business Analysis']
      .map((n, i) => fam(n, i < 6 ? [LEAK, own(n)] : [own(n), { name: `${n} second`, weight: 31 }]));

    expect(() => assertNoTemplateLeak(families))
      .toThrow(/RESEARCH_TEMPLATE_LEAK.*owns a service in production.*6 of 8/is);
    // Names the families, so an operator can see the absurdity without
    // re-reading forty must-haves.
    expect(() => assertNoTemplateLeak(families)).toThrow(/Customer Success/);
  });

  it('allows a signal genuinely shared by a minority', () => {
    // "Strong communication" in two of eight is plausible, not a leak. A guard
    // that fired here would block every honest pack.
    const shared = { name: 'Strong communication skills', weight: 30 };
    const families = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
      .map((n, i) => fam(n, i < 3 ? [shared, own(n)] : [own(n), { name: `${n} second`, weight: 31 }]));
    expect(() => assertNoTemplateLeak(families)).not.toThrow();
  });

  it('is case and whitespace insensitive', () => {
    // A model that varies capitalisation between families would otherwise slip
    // the same template past the check.
    const families = ['A', 'B', 'C', 'D', 'E']
      .map((n, i) => fam(n, [{
        name: i % 2 ? 'owns a  service in production' : 'Owns a Service In Production',
        weight: 50,
      }, own(n)]));
    expect(() => assertNoTemplateLeak(families)).toThrow(/RESEARCH_TEMPLATE_LEAK/);
  });

  it('says nothing about a pack too small for "most" to mean anything', () => {
    const families = ['A', 'B'].map((n) => fam(n, [LEAK, own(n)]));
    expect(() => assertNoTemplateLeak(families)).not.toThrow();
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
    expect(row.payload.researched.prompt_key).toBe('vara.domain_pack.families');
    expect(row.payload.researched.starter_prompt_key).toBe('vara.domain_pack.starter');
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
