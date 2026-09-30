/**
 * loadBrain / brainContext against the REAL migrations.
 *
 * What only a database can show: the confirmed-only filters (approved
 * clusters, confirmed active offers, approved brand) are applied by the SQL
 * this module actually runs, every read is scoped to the tenant, and the
 * column names match what production has — a renderer test would pass with
 * a misspelt column.
 */
import { execSync } from 'child_process';
import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { bootstrapSchema, FRAMEWORK } from '../../skills/__test-helpers__/schema';
import { loadBrain, brainContext } from '../brain.context';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'brain_context_test';

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

let pool: Pool;
let A: string;
let B: string;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });

  // 181 (gt_agent_runs, the graph) is referenced by the shared core set, so
  // it goes in first, on the same framework stubs the loader uses.
  await pool.query(FRAMEWORK);
  // 181 ALTERs gt_agent_runs, which 162 (the war room, not needed here) creates.
  await pool.query(`CREATE TABLE gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
    is_live BOOLEAN NOT NULL DEFAULT false, agent_type VARCHAR(30) NOT NULL, agent_name VARCHAR(100),
    action TEXT NOT NULL, status VARCHAR(20), created_at TIMESTAMPTZ DEFAULT now())`);
  await pool.query(fs.readFileSync(
    path.join(__dirname, '../../../migrations/181_gt_agent_infrastructure.sql'), 'utf8'));
  ({ A, B } = await bootstrapSchema(pool, [
    '184_gt_tenant_profile.sql',
    '192_gt_semantic_clusters.sql',
    '193_gt_tenant_brand.sql',
    '239_gt_offers_confirmed.sql',
  ]));

  await pool.query(
    `INSERT INTO gt_tenant_profile (tenant_id, product_name, product_description)
     VALUES ($1, 'Acme', 'Invoices for plumbers'), ($2, 'Rival', 'Someone else')`, [A, B]);

  await pool.query(
    `INSERT INTO gt_kg_nodes (tenant_id, label, name, description) VALUES
       ($1, 'Differentiator', 'Offline mode', 'works without signal'),
       ($1, 'Team', 'Asha', NULL),
       ($2, 'Differentiator', 'Their secret', 'not ours')`, [A, B]);

  await pool.query(
    `INSERT INTO gt_semantic_clusters (tenant_id, primary_term, related_terms, cluster_type, approved_at) VALUES
       ($1, 'invoicing', ARRAY['billing'], 'category', now()),
       ($1, 'drafted term', ARRAY[]::text[], 'pain', NULL),
       ($2, 'their term', ARRAY[]::text[], 'category', now())`, [A, B]);

  await pool.query(
    `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem, confirmed_at, is_active) VALUES
       ($1, 'core', 'Core', 'Invoices', 'Plumbers', 'Late pay', now(), true),
       ($1, 'draft', 'Draft offer', 'x', 'y', 'z', NULL, true),
       ($1, 'retired', 'Retired', 'x', 'y', 'z', now(), false),
       ($2, 'theirs', 'Theirs', 'x', 'y', 'z', now(), true)`, [A, B]);

  await pool.query(
    `INSERT INTO gt_tenant_brand (tenant_id, voice_tone, approved_at) VALUES
       ($1, ARRAY['plain'], NULL), ($2, ARRAY['loud'], now())`, [A, B]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

/**
 * The same reads as a role RLS applies to (not superuser, not bypassrls, not
 * the owner) — what vanigtm_app will be. withTenantClient's context is what
 * makes rows visible; a raw pool.query would see none.
 */
async function asAppRole<T>(fn: (p: Pool) => Promise<T>): Promise<T> {
  await pool.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'brain_ctx_app') THEN
      CREATE ROLE brain_ctx_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$`);
  await pool.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO brain_ctx_app;
                    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO brain_ctx_app`);
  const app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=brain_ctx_app' });
  try { return await fn(app); } finally { await app.end(); }
}

const d = available ? describe : describe.skip;

d('loadBrain', () => {
  it('reads only what a human confirmed, and counts what it left out', async () => {
    const brain = await loadBrain(pool, A);
    expect(brain.profile?.product_name).toBe('Acme');
    expect(brain.nodes.map((n) => n.name).sort()).toEqual(['Asha', 'Offline mode']);
    expect(brain.vocabulary.map((c) => c.primary_term)).toEqual(['invoicing']);
    expect(brain.offers.map((o) => o.offer_key)).toEqual(['core']);
    expect(brain.brand).toBeNull();
    expect(brain.unconfirmed).toEqual({ clusters: 1, offers: 1, brand: true });
  });

  it('never returns another tenant\'s rows', async () => {
    const brain = await loadBrain(pool, B);
    expect(brain.profile?.product_name).toBe('Rival');
    expect(brain.nodes.map((n) => n.name)).toEqual(['Their secret']);
    expect(brain.offers.map((o) => o.offer_key)).toEqual(['theirs']);
    expect(brain.brand?.voice_tone).toEqual(['loud']);
  });

  it('reads the same under RLS, as a non-owner role', async () => {
    await asAppRole(async (app) => {
      const r = await app.query('SELECT current_user AS u, count(*)::int AS n FROM gt_offers');
      expect(r.rows[0]).toEqual({ u: 'brain_ctx_app', n: 0 });   // no context → nothing

      const a = await loadBrain(app, A);
      expect(a.profile?.product_name).toBe('Acme');
      expect(a.nodes.map((n) => n.name).sort()).toEqual(['Asha', 'Offline mode']);
      expect(a.vocabulary.map((c) => c.primary_term)).toEqual(['invoicing']);
      expect(a.offers.map((o) => o.offer_key)).toEqual(['core']);
      expect(a.unconfirmed).toEqual({ clusters: 1, offers: 1, brand: true });

      const b = await loadBrain(app, B);
      expect(b.nodes.map((n) => n.name)).toEqual(['Their secret']);
    });
  });

  it('a tenant with no profile is refused, not handed an empty context', async () => {
    const empty = '99999999-9999-9999-9999-999999999999';
    await expect(brainContext(pool, empty, { purpose: 'deck', reserveOutputTokens: 100, fixedText: '' }))
      .rejects.toThrow(/PROFILE_NOT_FOUND/);
  });

  it('renders the deck context end to end', async () => {
    const ctx = await brainContext(pool, A, { purpose: 'deck', reserveOutputTokens: 100, fixedText: 'sys' });
    expect(ctx.text).toContain('Name: Acme');
    expect(ctx.text).toContain('[Differentiator] Offline mode — works without signal');
    expect(ctx.text).toContain('OFFERS (confirmed)\nCore — Invoices');
    expect(ctx.text).not.toContain('Draft offer');
    expect(ctx.text).not.toContain('Their secret');
    expect(ctx.missing).toContain('brand: drafted, not approved');
  });
});
