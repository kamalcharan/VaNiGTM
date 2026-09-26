/**
 * pending_failovers against a real PostgreSQL.
 *
 * Three checks (CLAUDE.md rule 7): valid · empty · wrong tenant → 0 rows. The
 * valid case also covers what the function is FOR: a parked run whose source
 * was read successfully afterwards is reported superseded; one whose source
 * is still failed, and one whose event named no source at all, are not.
 *
 * Skips without a database.
 */
import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { createTenantDb } from '../../../db';
import type { SkillContext } from '../../../shared/types';
import { pending_failovers } from '../functions/pending-failovers';

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
CREATE TABLE IF NOT EXISTS gt_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id UUID NOT NULL,
  event_type VARCHAR(60) NOT NULL, payload JSONB NOT NULL DEFAULT '{}'::jsonb, status VARCHAR(20) NOT NULL DEFAULT 'done',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL, agent_name VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued', started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  awaiting_input JSONB, steps JSONB NOT NULL DEFAULT '[]'::jsonb, error_trace TEXT);
`;

const ctxFor = (pool: Pool, tenant: string): SkillContext =>
  ({ tenant_id: tenant, db: createTenantDb(pool, tenant), is_live: false, user_id: CALLER, is_admin: false } as unknown as SkillContext);

(available ? describe : describe.skip)('llm-provider-skill.pending_failovers', () => {
  let pool: Pool;
  let supersededRun = '';
  let stillFailedRun = '';
  let noSourceRun = '';

  beforeAll(async () => {
    const conn = { host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: process.env.PGUSER || 'postgres' };
    const admin = new Pool({ ...conn, database: 'postgres' });
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = 'failover_test'`);
    if (!exists.rows.length) await admin.query('CREATE DATABASE failover_test');
    await admin.end();
    pool = new Pool({ ...conn, database: 'failover_test' });
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await pool.query(BASE);
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, '182_gt_ingestion.sql'), 'utf8'));
    await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'a'), ($2, 'b')`, [A, B]);

    // Two sources for A. One was read again and completed AFTER its run
    // parked; the other is still in error.
    const src = await pool.query(
      `INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, status)
       VALUES ($1, 'url', 'vikuna.io', 'https://vikuna.io/', 'error'),
              ($1, 'url', 'still-down.example', 'https://still-down.example/', 'error')
       RETURNING id`, [A]);
    const [readLater, stillDown] = src.rows.map((x) => x.id as string);

    // Runs parked minutes ago; the sources are touched now (the updated_at
    // trigger stamps now() whatever the UPDATE says), so "after" is real.
    const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
    const park = async (tenant: string, sourceId: string | null, startedAt: string) => {
      const ev = await pool.query(
        `INSERT INTO gt_events (tenant_id, event_type, payload) VALUES ($1, 'URL_SUBMITTED', $2::jsonb) RETURNING id`,
        [tenant, JSON.stringify(sourceId ? { source_id: sourceId } : { query: 'competitors' })]);
      const run = await pool.query(
        `INSERT INTO gt_agent_runs (tenant_id, agent_name, status, started_at, awaiting_input)
         VALUES ($1, 'ingestion-skill', 'awaiting', $2, $3::jsonb) RETURNING id`,
        [tenant, startedAt, JSON.stringify({
          kind: 'llm_failover_approval', event_id: ev.rows[0].id, event_type: 'URL_SUBMITTED',
          failover_model: 'claude-haiku-4-5', vps_error: 'LLM_VPS_ERROR: 400 n_ctx 4096', question: 'Retry?',
        })]);
      return String(run.rows[0].id);
    };

    supersededRun = await park(A, readLater, ago(30));
    stillFailedRun = await park(A, stillDown, ago(29));
    noSourceRun = await park(A, null, ago(28));
    // B has a parked run of its own — it must never show up for A.
    await park(B, null, ago(27));

    // The later read finished: the source is complete and touched after the run parked.
    await pool.query(
      `UPDATE gt_kb_sources SET status = 'complete', node_count = 103 WHERE id = $1`, [readLater]);
    // The other one failed again later — newer, but not a success.
    await pool.query(
      `UPDATE gt_kb_sources SET status = 'error', error_msg = 'LLM_FAILOVER_NEEDS_APPROVAL: again' WHERE id = $1`, [stillDown]);
  });

  afterAll(async () => { await pool?.end(); });

  it('valid: lists the tenant’s parked runs and marks the one a later read made moot', async () => {
    const r = await pending_failovers({}, ctxFor(pool, A));
    expect(r.runs.map((x) => x.run_id).sort()).toEqual([supersededRun, stillFailedRun, noSourceRun].sort());

    const done = r.runs.find((x) => x.run_id === supersededRun)!;
    expect(done.source).toMatchObject({ name: 'vikuna.io', status: 'complete' });
    expect(done.superseded).toBe(true);
    expect(done.superseded_detail).toMatch(/vikuna\.io was read successfully/);

    const failed = r.runs.find((x) => x.run_id === stillFailedRun)!;
    expect(failed.source).toMatchObject({ name: 'still-down.example', status: 'error' });
    expect(failed.superseded).toBe(false);

    const bare = r.runs.find((x) => x.run_id === noSourceRun)!;
    expect(bare.source).toBeNull();
    expect(bare.superseded).toBe(false);

    expect(r.detail).toMatch(/3 runs waiting/);
    expect(r.detail).toMatch(/1 of them is already done/);
  });

  it('valid: a run’s own vps_error and question come through verbatim', async () => {
    const r = await pending_failovers({}, ctxFor(pool, A));
    expect(r.runs[0].vps_error).toBe('LLM_VPS_ERROR: 400 n_ctx 4096');
    expect(r.runs[0].failover_model).toBe('claude-haiku-4-5');
  });

  it('empty: a tenant with no parked runs gets zero and says why it might be empty', async () => {
    await pool.query(`UPDATE gt_agent_runs SET status = 'failed' WHERE tenant_id = $1`, [B]);
    const r = await pending_failovers({}, ctxFor(pool, B));
    expect(r.runs).toEqual([]);
    expect(r.detail).toMatch(/Nothing waiting/);
    await pool.query(`UPDATE gt_agent_runs SET status = 'awaiting' WHERE tenant_id = $1`, [B]);
  });

  it('wrong tenant: B never sees A’s runs, and A never sees B’s', async () => {
    const b = await pending_failovers({}, ctxFor(pool, B));
    expect(b.runs).toHaveLength(1);
    expect(b.runs.some((x) => [supersededRun, stillFailedRun, noSourceRun].includes(x.run_id))).toBe(false);
    const a = await pending_failovers({}, ctxFor(pool, A));
    expect(a.runs).toHaveLength(3);
  });
});
