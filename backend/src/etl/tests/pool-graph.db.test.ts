/**
 * The pool's company graph in the existing KG tables (migration 271, S16
 * revised) against the REAL schema, with the app role where it matters:
 *
 *   - pool rows: one per (company, label, name); every run that found a fact is listed
 *   - a row is a tenant's or a pool company's, never both, never neither
 *   - the app role cannot see pool rows or write one directly; only the functions can
 *   - a tenant's Brain reads (kg.store) never include pool rows
 *   - withdrawing a run removes only what it alone found
 *   - a tenant whose own website is a pool company is seeded by copy; what the
 *     tenant already holds wins; another tenant sees none of it
 *   - a competitor's page, no website, not in the pool, or a shared domain: no seed
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import { findOwnPoolCompany, readPoolGraph, seedTenantFromPool, withdrawPoolRun, writePoolGraph } from '../pool-graph';
import { getNodes, upsertNode } from '../../agent-core/kg.store';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'pool_graph_test';
const BACKEND = path.resolve(__dirname, '../../..');
const A = '66666666-6666-6666-6666-666666666666';
const B = '77777777-7777-7777-7777-777777777777';

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;
let owner: Pool; let app: Pool;
let kavya: string; let other: string; let run1: string; let run2: string;

beforeAll(async () => {
  if (!available) return;
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  owner = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await owner.query(`
    INSERT INTO vn_tenants (id, slug) VALUES ('${A}', 'pg-a'), ('${B}', 'pg-b');
    INSERT INTO vn_tenant_profiles (tenant_id, name, website) VALUES ('${A}', 'Kavya Lab', 'https://www.kavyalab.example/'), ('${B}', 'Other', NULL);
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;`);
  // The functions' own grants (271) are what the app role gets — no blanket EXECUTE here.
  kavya = (await owner.query(`INSERT INTO gt_universe_companies (name, domain_normalized, lifecycle_state, admitted_at) VALUES ('Kavya Lab Instruments', 'kavyalab.example', 'complete', now()) RETURNING id::text`)).rows[0].id;
  other = (await owner.query(`INSERT INTO gt_universe_companies (name, domain_normalized) VALUES ('Analab', 'analab.example') RETURNING id::text`)).rows[0].id;
  run1 = (await owner.query(`INSERT INTO gt_agent_runs (tenant_id, agent_name, status) VALUES ($1, 'enrichment', 'completed') RETURNING id::text`, [A])).rows[0].id;
  run2 = (await owner.query(`INSERT INTO gt_agent_runs (tenant_id, agent_name, status) VALUES ($1, 'enrichment', 'completed') RETURNING id::text`, [A])).rows[0].id;
  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
}, 180000);
afterAll(async () => { if (app) await app.end(); if (owner) await owner.end(); });

const HPLC = { label: 'Product', name: 'HPLC columns' };
const QC = { label: 'ICP', name: 'Pharma QC labs' };

d('pool rows in the existing graph tables', () => {
  it('writes a company graph as the app role, through the functions only', async () => {
    const r = await writePoolGraph(app, kavya,
      [{ ...HPLC, description: 'C18 columns', properties: { page: '/products', confidence: 0.9 } }, { ...QC, description: 'QC labs' }],
      [{ from: HPLC, relationship: 'TARGETS', to: QC }, { from: HPLC, relationship: 'SOLVES', to: { label: 'PainPoint', name: 'not written' } }],
      run1);
    expect(r).toEqual({ nodes: 2, edges: 1, edges_skipped: ['HPLC columns SOLVES not written'] });
    // The same fact for a different company is a different node.
    await writePoolGraph(app, other, [{ ...HPLC, description: 'theirs' }], [], run1);
    const g = await readPoolGraph(app, kavya);
    expect(g.nodes.map((n) => n.name)).toEqual(['Pharma QC labs', 'HPLC columns']);
    expect(g.edges).toHaveLength(1);
    expect(g.nodes.find((n) => n.name === 'HPLC columns')!.properties).toMatchObject({ page: '/products', runs: [Number(run1)] });
  });

  it('a second run on the same fact adds itself to the runs, not a second row', async () => {
    await writePoolGraph(app, kavya, [{ ...HPLC, description: 'C18 and C8 columns' }, { label: 'Feature', name: 'Batch certificates' }], [], run2);
    const g = await readPoolGraph(app, kavya);
    expect(g.nodes).toHaveLength(3);
    const hplc = g.nodes.find((n) => n.name === 'HPLC columns')!;
    expect(hplc.description).toBe('C18 and C8 columns');
    expect((hplc.properties.runs as number[]).sort()).toEqual([Number(run1), Number(run2)].sort());
  });

  it('a row belongs to a tenant or to a pool company — never both, never neither', async () => {
    await expect(owner.query(`INSERT INTO gt_kg_nodes (tenant_id, universe_company_id, label, name) VALUES ($1, $2, 'Product', 'x')`, [A, kavya]))
      .rejects.toThrow(/one_owner/);
    await expect(owner.query(`INSERT INTO gt_kg_nodes (label, name) VALUES ('Product', 'y')`)).rejects.toThrow(/one_owner/);
  });

  it('the app role cannot see pool rows, nor write one directly', async () => {
    const c = await app.connect();
    try {
      await c.query('BEGIN'); await c.query('SELECT set_tenant_context($1)', [A]);
      expect((await c.query(`SELECT count(*)::int AS n FROM gt_kg_nodes WHERE tenant_id IS NULL`)).rows[0].n).toBe(0);
      await expect(c.query(`INSERT INTO gt_kg_nodes (universe_company_id, label, name) VALUES ($1, 'Product', 'z')`, [kavya]))
        .rejects.toThrow(/row-level security/);
      await c.query('ROLLBACK');
    } finally { c.release(); }
  });

  it("an edge cannot join two companies' nodes", async () => {
    const g1 = await readPoolGraph(app, kavya);
    const g2 = await readPoolGraph(app, other);
    await expect(app.query(`SELECT gt_pool_kg_upsert_edge($1, $2, 'TARGETS', $3, '{}'::jsonb, $4)`, [kavya, g1.nodes[0].id, g2.nodes[0].id, run1]))
      .rejects.toThrow(/POOL_KG_INVALID/);
  });

  it("a tenant's Brain never includes pool rows", async () => {
    await upsertNode(app, B, { label: 'Product', name: 'Their own thing', description: 'theirs' });
    expect((await getNodes(app, B)).map((n) => n.name)).toEqual(['Their own thing']);
  });

  it('withdrawing a run removes what it alone found, and keeps what another run also found', async () => {
    const r = await withdrawPoolRun(app, run2);
    expect(r).toEqual({ nodes_removed: 1, edges_removed: 0, nodes_kept: 1, edges_kept: 0 });
    const g = await readPoolGraph(app, kavya);
    expect(g.nodes.map((n) => n.name).sort()).toEqual(['HPLC columns', 'Pharma QC labs']);
    const hplc = (await owner.query(`SELECT properties, source_run_id::text FROM gt_kg_nodes WHERE tenant_id IS NULL AND universe_company_id = $1 AND name = 'HPLC columns'`, [kavya])).rows[0];
    expect(hplc.properties.runs).toEqual([Number(run1)]);
    expect(hplc.source_run_id).toBe(run1);
  });
});

d("seeding a tenant whose own website is a pool company", () => {
  it('finds the company only for the tenant\'s own site, and says why not otherwise', async () => {
    expect(await findOwnPoolCompany(app, A, 'https://kavyalab.example/about')).toMatchObject({ found: true, company_id: kavya });
    expect(await findOwnPoolCompany(app, A, 'https://analab.example/')).toMatchObject({ found: false, reason: 'not_own_site' });
    expect(await findOwnPoolCompany(app, B, 'https://analab.example/')).toMatchObject({ found: false, reason: 'no_website' });
    await owner.query(`UPDATE vn_tenant_profiles SET website = 'nobody.example' WHERE tenant_id = $1`, [B]);
    expect(await findOwnPoolCompany(app, B, 'https://nobody.example/')).toMatchObject({ found: false, reason: 'not_in_pool' });
  });

  it('sister companies on one domain are not guessed between', async () => {
    await owner.query(`UPDATE vn_tenant_profiles SET website = 'analab.example' WHERE tenant_id = $1`, [B]);
    await owner.query(`INSERT INTO gt_universe_companies (name, domain_normalized) VALUES ('Analab Services', 'analab.example')`);
    expect(await findOwnPoolCompany(app, B, 'https://analab.example/')).toMatchObject({ found: false, reason: 'ambiguous' });
  });

  it('copies the graph into the tenant\'s own rows; what the tenant already holds wins', async () => {
    await upsertNode(app, A, { label: 'ICP', name: 'Pharma QC labs', description: 'our words', properties: { human_edited: true } });
    const s = await seedTenantFromPool(app, A, kavya, run1);
    expect(s).toMatchObject({ nodes_added: 1, nodes_already_known: 1, edges_added: 1 });
    expect(s.read_at).toBeTruthy();
    const mine = await getNodes(app, A);
    expect(mine.find((n) => n.name === 'Pharma QC labs')!.description).toBe('our words');
    expect(mine.find((n) => n.name === 'HPLC columns')!.properties).toMatchObject({ page: '/products', from_pool: { company_id: kavya, runs: [Number(run1)] } });
    expect(mine.find((n) => n.name === 'HPLC columns')!.properties).not.toHaveProperty('runs');
    expect(mine.every((n) => n.tenant_id === A)).toBe(true);
  });

  it('seeding again adds nothing; the pool is untouched by the tenant\'s copy', async () => {
    expect(await seedTenantFromPool(app, A, kavya, run1)).toMatchObject({ nodes_added: 0, edges_added: 0 });
    const g = await readPoolGraph(app, kavya);
    expect(g.nodes.find((n) => n.name === 'Pharma QC labs')!.description).toBe('QC labs');
  });

  it("another tenant sees none of A's seeded rows", async () => {
    expect((await getNodes(app, B)).map((n) => n.name)).toEqual(['Their own thing']);
  });

  it('a company the pool has not read yet seeds nothing', async () => {
    const blank = (await owner.query(`INSERT INTO gt_universe_companies (name, domain_normalized) VALUES ('Blank Co', 'blank.example') RETURNING id::text`)).rows[0].id;
    expect(await seedTenantFromPool(app, B, blank, null)).toEqual({ nodes_added: 0, nodes_already_known: 0, edges_added: 0, read_at: null });
  });
});
