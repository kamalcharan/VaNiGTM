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
  beforeEach(async () => { await pool.query('DELETE FROM gt_kb_sources'); emitted.length = 0; });

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
});
