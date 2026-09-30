/**
 * Crawl before signup, end to end, against the REAL schema built by the real
 * migration runner, as a NOSUPERUSER NOBYPASSRLS role like production's
 * vanigtm_app. The website fetch and the model are mocked; everything else —
 * the reuse layers, the rate limit, the spend cap row, the job, the claim and
 * the RLS on the tenant tables it writes — is real.
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';

const fetched: string[] = [];
let fetchImpl: (url: string) => Promise<{ html: string; finalUrl: string }> = async (url) => ({
  html: `<html><head><title>Acme</title></head><body><p>${'Acme sends invoices for plumbers and gets them paid. '.repeat(10)}</p></body></html>`,
  finalUrl: url,
});
jest.mock('../site', () => {
  const actual = jest.requireActual('../site');
  return { ...actual, fetchPublicHtml: jest.fn(async (url: string) => { fetched.push(url); return fetchImpl(url); }) };
});
const drafts: string[] = [];
jest.mock('../../skills/profile-skill/profile.drafter', () => ({
  draftFromText: jest.fn(async (_p: unknown, tenantId: string) => {
    drafts.push(tenantId);
    return { product_name: 'Acme', product_tagline: 'Paid on time', product_category: 'Invoicing',
      product_description: 'Invoices for plumbers', key_differentiators: ['Offline'] };
  }),
}));

import { submitSite, siteStatus, runSiteRead, claimSite, FUNNEL_TENANT_SLUG } from '../funnel.service';
import { createRun } from '../../agent-core/agent.runner';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'funnel_test';
const BACKEND = path.resolve(__dirname, '../../..');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

const A = 'bbbbbbbb-0000-0000-0000-00000000000a';
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
let owner: Pool;
let app: Pool;
let funnelTenant: string;

const ENV = {
  FUNNEL_REUSE_HOURS: '720', FUNNEL_MAX_PER_IP_PER_HOUR: '2', FUNNEL_SESSION_DAYS: '7',
  FUNNEL_DAILY_TOKEN_LIMIT: '50000', FUNNEL_READ_TIMEOUT_MINUTES: '10',
  FUNNEL_IP_HASH_KEY: 'funnel-test-key-0123456789abcdef0123456789',
};

beforeAll(async () => {
  if (!available) return;
  Object.assign(process.env, ENV);
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`,
      DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });

  owner = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await owner.query(`
    INSERT INTO vn_tenants (id, slug, status) VALUES ('${A}','fa','active'), ('${B}','fb','active');
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vanigtm_app;
  `);
  funnelTenant = (await owner.query(`SELECT id FROM vn_tenants WHERE slug = $1`, [FUNNEL_TENANT_SLUG])).rows[0].id;
  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
}, 180000);

afterAll(async () => { if (app) await app.end(); if (owner) await owner.end(); });

const d = available ? describe : describe.skip;

/** What the worker does for the newest queued funnel event. */
async function runQueuedRead(): Promise<unknown> {
  const ev = (await owner.query(
    `SELECT id, tenant_id, payload FROM gt_events WHERE event_type = 'FUNNEL_SITE_SUBMITTED'
      ORDER BY created_at DESC LIMIT 1`)).rows[0];
  const runId = await createRun(app, ev.tenant_id, 'FUNNEL_SITE_SUBMITTED', ev.id, ev.payload);
  return runSiteRead(app, ev.tenant_id, ev.payload, String(runId));
}

d('the three layers — a revisit never pays twice', () => {
  let tokenA: string;

  it('a new site: one queued read, one event under the funnel tenant, the cap row set from .env', async () => {
    const r = await submitSite(app, { website: 'http://www.contractnest.com/', ip: '1.1.1.1' });
    tokenA = r.token;
    expect(r).toMatchObject({ reused: 'new', status: 'reading', site: 'contractnest.com', card: null });
    const ev = await owner.query(`SELECT tenant_id FROM gt_events WHERE event_type = 'FUNNEL_SITE_SUBMITTED'`);
    expect(ev.rows).toEqual([{ tenant_id: funnelTenant }]);
    const cap = await owner.query(`SELECT daily_token_limit FROM gt_tenant_context WHERE tenant_id = $1`, [funnelTenant]);
    expect(cap.rows[0].daily_token_limit).toBe(50000);
  });

  it('layer 3: another visitor, other spelling, while it is still reading → joins it, no new event', async () => {
    const r = await submitSite(app, { website: 'CONTRACTNEST.COM/about', ip: '2.2.2.2' });
    expect(r).toMatchObject({ reused: 'in_progress', status: 'reading' });
    expect((await owner.query(`SELECT count(*)::int n FROM gt_events WHERE event_type = 'FUNNEL_SITE_SUBMITTED'`)).rows[0].n).toBe(1);
  });

  it('the job reads the homepage and drafts ONE card, under the funnel tenant', async () => {
    fetched.length = 0; drafts.length = 0;
    await runQueuedRead();
    expect(fetched).toEqual(['https://contractnest.com/']);
    expect(drafts).toEqual([funnelTenant]);
    const s = await siteStatus(app, tokenA);
    expect(s).toMatchObject({ status: 'read', card: { product_name: 'Acme', product_category: 'Invoicing' }, failure: null });
    expect(JSON.stringify(s)).not.toContain('invoices for plumbers and gets them paid');   // page text is never shown
  });

  it('layer 1: the same visitor comes back with their token → their own session', async () => {
    const r = await submitSite(app, { website: 'contractnest.com', ip: '9.9.9.9', token: tokenA });
    expect(r).toMatchObject({ reused: 'session', token: tokenA, status: 'read' });
  });

  it('layer 2: anyone, any IP, any spelling, later → the stored card, no model call', async () => {
    drafts.length = 0;
    const r = await submitSite(app, { website: 'https://contractnest.com', ip: '3.3.3.3' });
    expect(r).toMatchObject({ reused: 'site', status: 'read', card: { product_name: 'Acme' } });
    expect(r.token).not.toBe(tokenA);   // their own session, never someone else's token
    expect(drafts).toHaveLength(0);
  });
});

d('limits and failures', () => {
  it('the per-IP limit counts only NEW reads', async () => {
    await submitSite(app, { website: 'one.test', ip: '5.5.5.5' });
    await submitSite(app, { website: 'contractnest.com', ip: '5.5.5.5' });     // reuse: does not count
    await submitSite(app, { website: 'two.test', ip: '5.5.5.5' });
    await expect(submitSite(app, { website: 'three.test', ip: '5.5.5.5' })).rejects.toThrow(/RATE_LIMITED/);
  });

  it('an unreadable site fails loudly with the real reason — never a sample card', async () => {
    const r = await submitSite(app, { website: 'broken.test', ip: '6.6.6.6' });
    const was = fetchImpl;
    fetchImpl = async () => { throw Object.assign(new Error('SITE_UNREACHABLE: broken.test answered HTTP 503'), {}); };
    try { await expect(runQueuedRead()).rejects.toThrow(/HTTP 503/); }
    finally { fetchImpl = was; }
    const s = await siteStatus(app, r.token);
    expect(s).toMatchObject({ status: 'failed', card: null });
    expect(s.failure).toMatch(/HTTP 503/);
  });

  it('a read stuck past the timeout reads as failed, and the next visitor starts a fresh one', async () => {
    const r = await submitSite(app, { website: 'stuck.test', ip: '7.7.7.7' });
    await owner.query(`UPDATE vani_anon_site_read SET created_at = now() - interval '1 hour' WHERE website_host = 'stuck.test'`);
    expect((await siteStatus(app, r.token)).failure).toMatch(/took too long/);
    const again = await submitSite(app, { website: 'stuck.test', ip: '8.8.8.8' });
    expect(again.reused).toBe('new');
  });
});

d('claim after signup', () => {
  let token: string;
  beforeAll(async () => {
    token = (await submitSite(app, { website: 'contractnest.com', ip: '4.4.4.4' })).token;
  });

  it('attaches the card to the tenant: knowledge source, full crawl queued, profile filled', async () => {
    const r = await claimSite(app, A, token);
    expect(r).toMatchObject({ site: 'contractnest.com', profile_applied: true });
    const src = await owner.query(`SELECT tenant_id, url, status FROM gt_kb_sources WHERE id = $1`, [r.source_id]);
    expect(src.rows[0]).toEqual({ tenant_id: A, url: 'https://contractnest.com/', status: 'pending' });
    const ev = await owner.query(`SELECT payload FROM gt_events WHERE tenant_id = $1 AND event_type = 'URL_SUBMITTED'`, [A]);
    expect(ev.rows[0].payload).toMatchObject({ source_id: r.source_id, from: 'funnel' });
    const p = await owner.query(`SELECT product_name, product_category, source FROM gt_tenant_profile WHERE tenant_id = $1`, [A]);
    expect(p.rows[0]).toEqual({ product_name: 'Acme', product_category: 'Invoicing', source: 'vani' });
  });

  it('claiming again is harmless; another workspace cannot take it', async () => {
    expect(await claimSite(app, A, token)).toMatchObject({ already_claimed: true });
    await expect(claimSite(app, B, token)).rejects.toThrow(/ALREADY_CLAIMED/);
    const bSources = await owner.query(`SELECT count(*)::int n FROM gt_kb_sources WHERE tenant_id = $1`, [B]);
    expect(bSources.rows[0].n).toBe(0);
  });

  it('a failed or unknown preview has nothing to keep', async () => {
    const failedToken = (await submitSite(app, { website: 'broken.test', ip: '4.4.4.5' })).token;
    await expect(claimSite(app, B, failedToken)).rejects.toThrow(/NOT_READY/);
    await expect(claimSite(app, B, 'no-such-token')).rejects.toThrow(/NOT_FOUND/);
  });
});
