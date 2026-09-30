/**
 * An approved failover must be READABLE by the retried run.
 *
 * The mechanism: `resolve_failover` re-emits the original event with
 * `allow_failover: true` in the EVENT payload; the worker creates a run for
 * it; `mayFailOver` reads `gt_agent_runs.inputs -> 'allow_failover'`. Until
 * 2026-09-30 `createRun` never wrote `inputs`, so the flag never reached the
 * run and an approved retry parked again with the same question.
 *
 * The unit test for the gate (`llm-failover-gate.test.ts`) mocks the SQL that
 * reads the flag, so it could not catch a flag that was never written. This
 * one drives the real INSERT and the real SELECT against a real table.
 *
 * Runs only when a Postgres answers on PGHOST/PGPORT (same convention as
 * event-reclaim.db.test.ts); otherwise it is skipped, loudly named.
 */
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { createRun } from '../agent.runner';

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

const TENANT = '11111111-1111-1111-1111-111111111111';

/* Only the columns createRun and mayFailOver touch. */
const BASE = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE gt_agent_runs (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   UUID NOT NULL,
  agent_name  VARCHAR(100) NOT NULL,
  event_id    UUID,
  status      VARCHAR(20) NOT NULL,
  inputs      JSONB DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

let pool: Pool;
const d = available ? describe : describe.skip;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS failover_approval_test');
  await admin.query('CREATE DATABASE failover_approval_test');
  await admin.end();
  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'failover_approval_test' });
  await pool.query(BASE);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

// HAIKU_DEFAULT is read from .env on every call (llm.config.ts), so the case's
// setting must stay in force while the gate runs; it is restored after each.
const envBefore = { ...process.env };
afterEach(() => { process.env = { ...envBefore }; });

async function gateFor(env: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...process.env, ...env };
  const mod = await import('../llm.client');
  return mod.mayFailOver;
}

d('failover approval reaches the run', () => {
  it('the re-emitted payload lands in gt_agent_runs.inputs and the gate reads it', async () => {
    const mayFailOver = await gateFor({ HAIKU_DEFAULT: 'false' });
    const runId = await createRun(pool, TENANT, 'URL_SUBMITTED', undefined,
      { source_id: 'src-1', allow_failover: true });
    const row = await pool.query(`SELECT inputs FROM gt_agent_runs WHERE id = $1`, [runId]);
    expect(row.rows[0].inputs).toEqual({ source_id: 'src-1', allow_failover: true });
    expect(await mayFailOver(pool, runId)).toBe(true);
  });

  it('a run started from an ordinary event is NOT approved', async () => {
    const mayFailOver = await gateFor({ HAIKU_DEFAULT: 'false' });
    const runId = await createRun(pool, TENANT, 'URL_SUBMITTED', undefined, { source_id: 'src-2' });
    expect(await mayFailOver(pool, runId)).toBe(false);
  });

  it('a run with no payload at all is NOT approved, and inputs is {} not null', async () => {
    const mayFailOver = await gateFor({ HAIKU_DEFAULT: 'false' });
    const runId = await createRun(pool, TENANT, 'TENANT_REGISTERED');
    const row = await pool.query(`SELECT inputs FROM gt_agent_runs WHERE id = $1`, [runId]);
    expect(row.rows[0].inputs).toEqual({});
    expect(await mayFailOver(pool, runId)).toBe(false);
  });

  it('an agent stamping its own key keeps the payload (merge, not overwrite)', async () => {
    // domain-pack.agent.ts writes `inputs = COALESCE(inputs,'{}') || {domain}`.
    const mayFailOver = await gateFor({ HAIKU_DEFAULT: 'false' });
    const runId = await createRun(pool, TENANT, 'DOMAIN_ENRICHMENT_REQUESTED', undefined,
      { allow_failover: true });
    await pool.query(
      `UPDATE gt_agent_runs SET inputs = COALESCE(inputs,'{}'::jsonb) || jsonb_build_object('domain', $1::text) WHERE id = $2`,
      ['technology-saas', runId]);
    const row = await pool.query(`SELECT inputs FROM gt_agent_runs WHERE id = $1`, [runId]);
    expect(row.rows[0].inputs).toEqual({ allow_failover: true, domain: 'technology-saas' });
    expect(await mayFailOver(pool, runId)).toBe(true);
  });
});
