/**
 * The ingestion skill functions against a real PostgreSQL, event bus stubbed.
 *
 * Three checks per read (CLAUDE.md rule 7): valid data · empty · wrong
 * tenant → 0 rows. The functions are the console's only path to
 * gt_kb_sources on the deployed stack (nginx exposes the skill runner, not
 * /api/v1/ingest), so a tenant filter missing here is a cross-tenant leak in
 * production, not a cosmetic bug.
 *
 * Skips without a database.
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createTenantDb } from '../../../db';
import type { SkillContext } from '../../../shared/types';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const CALLER = '99999999-9999-9999-9999-999999999999';
const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

const emitted: { tenant: string; type: string; payload: Record<string, unknown> }[] = [];
jest.mock('../../../agent-core/event.store', () => ({
  emitEvent: jest.fn(async (_pool: unknown, tenant: string, type: string, _src: string, payload: Record<string, unknown>) => {
    emitted.push({ tenant, type, payload });
    return 'evt';
  }),
}));
// The functions reach the bus through getPool(); the bus is stubbed above, so
// the pool must simply exist without a DB_PRIMARY.
jest.mock('../../../db/pool', () => ({ getPool: () => ({}) }));

import { list_sources } from '../functions/list-sources';
import { get_source } from '../functions/get-source';
import { submit_url } from '../functions/submit-url';
import { submit_text } from '../functions/submit-text';
import { delete_source } from '../functions/delete-source';
import { knowledge } from '../functions/knowledge';
import { update_node } from '../functions/update-node';
import { delete_node } from '../functions/delete-node';
import { upsertNode } from '../../../agent-core/kg.store';

const BASE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE OR REPLACE FUNCTION update_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION vn_set_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
CREATE TABLE IF NOT EXISTS gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', steps JSONB NOT NULL DEFAULT '[]'::jsonb, error_trace TEXT);
CREATE TABLE IF NOT EXISTS gt_kg_nodes (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  label VARCHAR(50) NOT NULL, name VARCHAR(200) NOT NULL, description TEXT, properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_run_id BIGINT, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, label, name));
CREATE TABLE IF NOT EXISTS gt_kg_edges (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  from_node_id UUID NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE, to_node_id UUID NOT NULL REFERENCES gt_kg_nodes(id) ON DELETE CASCADE,
  relationship VARCHAR(60) NOT NULL, properties JSONB NOT NULL DEFAULT '{}'::jsonb, source_run_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (tenant_id, from_node_id, relationship, to_node_id));
`;

const ctxFor = (pool: Pool, tenant: string): SkillContext =>
  ({ tenant_id: tenant, db: createTenantDb(pool, tenant), is_live: false, user_id: CALLER, is_admin: false } as unknown as SkillContext);

(available ? describe : describe.skip)('ingestion-skill functions', () => {
  let pool: Pool;
  beforeAll(async () => {
    // Own database, as domain-pack's test does — never the shared one.
    const conn = { host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres' };
    const admin = new Pool({ ...conn, database: 'postgres' });
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'ingestion_test'`);
    if (!exists.rows.length) await admin.query('CREATE DATABASE ingestion_test');
    await admin.end();
    pool = new Pool({ ...conn, database: 'ingestion_test' });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(BASE);
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, '182_gt_ingestion.sql'), 'utf8'));
    await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'a'), ($2, 'b')`, [A, B]);
  });
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await pool.query('DELETE FROM gt_kb_sources'); await pool.query('DELETE FROM gt_kg_nodes'); emitted.length = 0; });

  test('empty: a tenant with nothing read sees nothing', async () => {
    const r = await list_sources({}, ctxFor(pool, A));
    expect(r.sources).toEqual([]);
    expect(r.total).toBe(0);
  });

  test('valid: a submitted URL and pasted text are listed, newest first, and each emits its event', async () => {
    const u = await submit_url({ url: 'ledgerline.example/pricing' }, ctxFor(pool, A));
    expect(u.url).toBe('https://ledgerline.example/pricing');
    const t = await submit_text({ text: 'x'.repeat(60), title: 'Sales deck' }, ctxFor(pool, A));
    const r = await list_sources({}, ctxFor(pool, A));
    expect(r.sources.map((s) => s.display_name)).toEqual(['Sales deck', 'ledgerline.example']);
    expect(emitted.map((e) => e.type)).toEqual(['URL_SUBMITTED', 'FILE_UPLOADED']);
    expect(emitted[1].payload.source_id).toBe(t.source_id);
    const one = await get_source({ source_id: u.source_id }, ctxFor(pool, A));
    expect(one.source.status).toBe('pending');
  });

  test('re-submitting a URL re-ingests instead of adding a second row', async () => {
    const first = await submit_url({ url: 'https://ledgerline.example/' }, ctxFor(pool, A));
    await pool.query(`UPDATE gt_kb_sources SET status = 'error', error_msg = 'boom' WHERE id = $1`, [first.source_id]);
    const again = await submit_url({ url: 'ledgerline.example' }, ctxFor(pool, A));
    expect(again.source_id).toBe(first.source_id);
    const r = await list_sources({}, ctxFor(pool, A));
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].status).toBe('pending');
    expect(r.sources[0].error_msg).toBeNull();
  });

  test('wrong tenant: B sees none of A\'s sources, cannot read one by id, cannot delete it', async () => {
    const u = await submit_url({ url: 'ledgerline.example' }, ctxFor(pool, A));
    expect((await list_sources({}, ctxFor(pool, B))).sources).toEqual([]);
    await expect(get_source({ source_id: u.source_id }, ctxFor(pool, B))).rejects.toThrow(/SOURCE_NOT_FOUND/);
    await expect(delete_source({ source_id: u.source_id }, ctxFor(pool, B))).rejects.toThrow(/SOURCE_NOT_FOUND/);
    expect((await list_sources({}, ctxFor(pool, A))).sources).toHaveLength(1);
  });

  test('delete removes the source row for its own tenant', async () => {
    const u = await submit_url({ url: 'ledgerline.example' }, ctxFor(pool, A));
    const d = await delete_source({ source_id: u.source_id }, ctxFor(pool, A));
    expect(d.deleted).toBe(true);
    expect((await list_sources({}, ctxFor(pool, A))).sources).toEqual([]);
  });

  test('refusals name the cause: too-short text, bad URL, missing id', async () => {
    await expect(submit_text({ text: 'short' }, ctxFor(pool, A))).rejects.toThrow(/TEXT_TOO_SHORT/);
    await expect(submit_url({ url: 'not a url' }, ctxFor(pool, A))).rejects.toThrow(/INVALID_URL/);
    await expect(get_source({ source_id: '' }, ctxFor(pool, A))).rejects.toThrow(/MISSING_FIELDS/);
  });

  describe('knowledge — what VaNi knows', () => {
    const seed = async (tenant: string) => {
      const run = await pool.query(`INSERT INTO gt_agent_runs (tenant_id, status) VALUES ($1, 'completed') RETURNING id`, [tenant]);
      const runId = run.rows[0].id;
      await pool.query(`INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, status, source_run_id)
                        VALUES ($1, 'url', 'ledgerline.example', 'https://ledgerline.example', 'complete', $2)`, [tenant, runId]);
      await pool.query(`INSERT INTO gt_kg_nodes (tenant_id, label, name, description, source_run_id) VALUES
        ($1, 'Product', 'Ledgerline', 'Contract software for hospitals', $2),
        ($1, 'PainPoint', 'Missed renewals', 'Renewals slip because contracts live in spreadsheets', $2),
        ($1, 'Competitor', 'ContractWorks', NULL, NULL)`, [tenant, runId]);
      await pool.query(`INSERT INTO gt_kg_edges (tenant_id, from_node_id, to_node_id, relationship)
        SELECT $1, p.id, q.id, 'SOLVES' FROM gt_kg_nodes p, gt_kg_nodes q
         WHERE p.tenant_id = $1 AND p.name = 'Ledgerline' AND q.tenant_id = $1 AND q.name = 'Missed renewals'`, [tenant]);
    };

    test('empty: a tenant with nothing learned sees no nodes and no labels', async () => {
      const r = await knowledge({}, ctxFor(pool, A));
      expect(r.nodes).toEqual([]);
      expect(r.labels).toEqual([]);
      expect(r.total).toBe(0);
    });

    test('valid: nodes come grouped by kind, each with the source that produced it', async () => {
      await seed(A);
      const r = await knowledge({}, ctxFor(pool, A));
      expect(r.total).toBe(3);
      expect(r.labels).toEqual([{ label: 'Competitor', count: 1 }, { label: 'PainPoint', count: 1 }, { label: 'Product', count: 1 }]);
      const product = r.nodes.find((n) => n.label === 'Product') as Record<string, unknown>;
      expect(product.source_name).toBe('ledgerline.example');
      const competitor = r.nodes.find((n) => n.label === 'Competitor') as Record<string, unknown>;
      expect(competitor.source_name).toBeNull();   // conversation-written: no source, and that is shown, not hidden
      // The relationship rides along, with both ends being nodes in the answer.
      expect(r.edges).toHaveLength(1);
      const e = r.edges[0] as Record<string, unknown>;
      expect(e.relationship).toBe('SOLVES');
      expect(r.nodes.map((n) => n.id)).toEqual(expect.arrayContaining([e.from_node_id, e.to_node_id]));
      const only = await knowledge({ label: 'PainPoint' }, ctxFor(pool, A));
      expect(only.nodes).toHaveLength(1);
      expect(only.filtered_total).toBe(1);
      expect(only.total).toBe(3);                   // the label counts are the whole graph, not the filtered page
    });

    test('wrong tenant: B sees none of what A learned', async () => {
      await seed(A);
      const r = await knowledge({}, ctxFor(pool, B));
      expect(r.nodes).toEqual([]);
      expect(r.edges).toEqual([]);
      expect(r.total).toBe(0);
    });
  });

  describe('a person corrects the graph', () => {
    const seed = async (tenant: string) => {
      await pool.query(`INSERT INTO gt_kg_nodes (tenant_id, label, name, description) VALUES
        ($1, 'Product', 'Ledgerline', 'Contract software for hospitals'),
        ($1, 'PainPoint', 'Missed renewals', 'Renewals slip'),
        ($1, 'PainPoint', 'Unclaimed penalties', 'Penalties never raised')`, [tenant]);
      await pool.query(`INSERT INTO gt_kg_edges (tenant_id, from_node_id, to_node_id, relationship)
        SELECT $1, p.id, q.id, 'SOLVES' FROM gt_kg_nodes p, gt_kg_nodes q
         WHERE p.tenant_id = $1 AND p.name = 'Ledgerline' AND q.tenant_id = $1 AND q.name = 'Missed renewals'`, [tenant]);
      const r = await pool.query(`SELECT id, name FROM gt_kg_nodes WHERE tenant_id = $1`, [tenant]);
      return Object.fromEntries(r.rows.map((x: { id: string; name: string }) => [x.name, x.id])) as Record<string, string>;
    };

    test('valid: an edit is recorded as the person\'s, and a later read does not overwrite it', async () => {
      const ids = await seed(A);
      const r = await update_node({ node_id: ids['Ledgerline'], description: 'Contract software for 200–800 bed hospitals' }, ctxFor(pool, A));
      expect((r.node as Record<string, unknown>).description).toBe('Contract software for 200–800 bed hospitals');
      expect(((r.node as Record<string, unknown>).properties as Record<string, unknown>).human_edited).toBe(true);
      // The extractor reads the page again and proposes the model's wording.
      await upsertNode(pool, A, { label: 'Product', name: 'Ledgerline', description: 'Contract software for hospitals' });
      const after = await pool.query(`SELECT description, properties FROM gt_kg_nodes WHERE id = $1`, [ids['Ledgerline']]);
      expect(after.rows[0].description).toBe('Contract software for 200–800 bed hospitals');   // human wins
      expect(after.rows[0].properties.model_description).toBe('Contract software for hospitals'); // model's kept, not lost
    });

    test('rename onto an existing entry of the same kind is refused', async () => {
      const ids = await seed(A);
      await expect(update_node({ node_id: ids['Missed renewals'], name: 'Unclaimed penalties' }, ctxFor(pool, A))).rejects.toThrow(/NAME_TAKEN/);
      const ok = await update_node({ node_id: ids['Missed renewals'], name: 'Renewals missed' }, ctxFor(pool, A));
      expect((ok.node as Record<string, unknown>).name).toBe('Renewals missed');
    });

    test('delete removes the entry and its relationships', async () => {
      const ids = await seed(A);
      const d = await delete_node({ node_id: ids['Missed renewals'] }, ctxFor(pool, A));
      expect(d.edges_removed).toBe(1);
      expect((await knowledge({}, ctxFor(pool, A))).edges).toEqual([]);
      expect((await knowledge({}, ctxFor(pool, A))).total).toBe(2);
    });

    test('wrong tenant: B can neither edit nor delete A\'s entries', async () => {
      const ids = await seed(A);
      await expect(update_node({ node_id: ids['Ledgerline'], name: 'x' }, ctxFor(pool, B))).rejects.toThrow(/NODE_NOT_FOUND/);
      await expect(delete_node({ node_id: ids['Ledgerline'] }, ctxFor(pool, B))).rejects.toThrow(/NODE_NOT_FOUND/);
      expect((await knowledge({}, ctxFor(pool, A))).total).toBe(3);
    });

    test('refusals name the cause', async () => {
      await expect(update_node({ node_id: '' }, ctxFor(pool, A))).rejects.toThrow(/MISSING_FIELDS/);
      const ids = await seed(A);
      await expect(update_node({ node_id: ids['Ledgerline'] }, ctxFor(pool, A))).rejects.toThrow(/MISSING_FIELDS/);
      await expect(update_node({ node_id: ids['Ledgerline'], name: '  ' }, ctxFor(pool, A))).rejects.toThrow(/INVALID_NAME/);
    });
  });
});