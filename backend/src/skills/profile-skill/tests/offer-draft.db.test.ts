/**
 * generateOfferDrafts reads the profile through brain.context (D2).
 *
 * The move must not change what the model is sent. The model is mocked and
 * the message it receives is compared with the one the pre-D2 code built
 * (main at 5579b2d): the same JSON, the same fields, site text cut at 12,000.
 * Plus the three checks: valid data drafts, no profile refuses, and another
 * tenant's profile is never read.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { bootstrapSchema, FRAMEWORK } from '../../__test-helpers__/schema';

const calls: Array<{ system: string; content: string }> = [];
jest.mock('../../../agent-core/llm.client', () => ({
  callLLMValidated: jest.fn(async (opts: { system: string; messages: Array<{ content: string }> }) => {
    calls.push({ system: opts.system, content: opts.messages[0].content });
    return { offers: [{ name: 'Site Audits', one_line: 'Audits', who_for: 'Plumbers', problem: 'Leaks',
                        what_we_do: ['audit'], signals: ['s'], disqualifiers: ['d'] }] };
  }),
}));
jest.mock('../../../agent-core/prompt.store', () => ({
  loadPrompt: jest.fn(async () => 'SYSTEM PROMPT'),
}));

import { generateOfferDrafts } from '../offer-draft.service';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'offer_draft_test';
const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

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

  await pool.query(FRAMEWORK);
  // 181 ALTERs gt_agent_runs, which 162 (the war room, not needed here) creates.
  await pool.query(`CREATE TABLE gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
    is_live BOOLEAN NOT NULL DEFAULT false, agent_type VARCHAR(30) NOT NULL, agent_name VARCHAR(100),
    action TEXT NOT NULL, status VARCHAR(20), created_at TIMESTAMPTZ DEFAULT now())`);
  for (const m of ['181_gt_agent_infrastructure.sql', '182_gt_ingestion.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
  ({ A, B } = await bootstrapSchema(pool, [
    '184_gt_tenant_profile.sql', '192_gt_semantic_clusters.sql',
    '193_gt_tenant_brand.sql', '239_gt_offers_confirmed.sql',
  ]));

  await pool.query(
    `INSERT INTO gt_tenant_profile (tenant_id, product_name, product_description, icp_role)
     VALUES ($1, 'Acme', 'Invoices for plumbers', 'Owner')`, [A]);
  await pool.query(
    `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem, confirmed_at) VALUES
       ($1, 'core', 'Core Invoicing', 'Invoices', 'Plumbers', 'Late pay', now()),
       ($1, 'maybe', 'Payment Chasing', 'x', 'y', 'z', NULL)`, [A]);
  await pool.query(
    `INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, raw_text, status)
     VALUES ($1, 'url', 'acme.test', 'https://acme.test', $2, 'complete')`, [A, 'S'.repeat(20_000)]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

const d = available ? describe : describe.skip;

d('generateOfferDrafts through brain.context', () => {
  beforeEach(() => { calls.length = 0; });

  it('sends the model exactly what it sent before the move', async () => {
    const drafted = await generateOfferDrafts(pool, A, 1);
    expect(drafted).toEqual([{ offer_key: 'site-audits', name: 'Site Audits' }]);

    const expected = `Company context:\n${JSON.stringify({
      product_name: 'Acme',
      product_description: 'Invoices for plumbers',
      core_problem: null,
      key_differentiators: [],
      site_text: 'S'.repeat(12_000),
    }, null, 2)}`;
    expect(calls[0].system).toBe('SYSTEM PROMPT');
    expect(calls[0].content).toBe(expected);

    const r = await pool.query(
      `SELECT source, confirmed_at FROM gt_offers WHERE tenant_id = $1 AND offer_key = 'site-audits'`, [A]);
    expect(r.rows[0]).toEqual({ source: 'agent', confirmed_at: null });
  });

  it('refuses a tenant with no profile, and never reads another tenant\'s', async () => {
    await expect(generateOfferDrafts(pool, B, 1)).rejects.toThrow(/PROFILE_NOT_FOUND/);
    expect(calls).toHaveLength(0);
  });
});
