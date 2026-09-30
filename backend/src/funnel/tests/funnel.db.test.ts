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

const graphCalls: string[] = [];
let graphImpl: () => Promise<unknown> = async () => ({
  status: 'read', truncated: false, chunks_read: 1, chunks_total: 1,
  nodes: [
    { id: 'n1', label: 'Product', name: 'Acme', description: 'Invoicing for plumbers', properties: { source_url: 'https://contractnest.com/' } },
    { id: 'n2', label: 'ICP', name: 'Plumbers', description: 'Small plumbing firms', properties: {} },
  ],
  edges: [{ id: 'e1', from_node_id: 'n1', to_node_id: 'n2', relationship: 'TARGETS' }],
});
jest.mock('../site-graph', () => ({
  readSiteGraph: jest.fn(async (_p: unknown, tenantId: string) => { graphCalls.push(tenantId); return graphImpl(); }),
}));

import { submitSite, siteStatus, runSiteRead, claimSite, requestAccess, FUNNEL_TENANT_SLUG } from '../funnel.service';
import { createTenantDb } from '../../db/query';
import { list_requests } from '../../skills/access-skill/functions/list-requests';
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
  FUNNEL_GRAPH_MAX_CHUNKS: '3', FUNNEL_LEADS_TENANT_SLUG: 'fa',
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

  it('the same read carries the digital audit (static page) and the graph, under the funnel tenant', async () => {
    const s = await siteStatus(app, tokenA);
    expect(s.audit).toEqual({ present: ['title', 'body_text'], missing: ['meta_description', 'og_tags', 'json_ld'] });
    expect(s.graph).toMatchObject({ partial: false, edges: [{ from_node_id: 'n1', to_node_id: 'n2', relationship: 'TARGETS' }] });
    expect(s.graph?.nodes.map((n) => n.name)).toEqual(['Acme', 'Plumbers']);
    expect(s.graph_failure).toBeNull();
    expect(s.read_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(graphCalls).toEqual([funnelTenant]);
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

  it('a graph that cannot be read keeps the card, and says why', async () => {
    const r = await submitSite(app, { website: 'nograph.test', ip: '6.6.6.7' });
    const was = graphImpl;
    graphImpl = async () => ({ status: 'failed', failure: 'VaNi found nothing specific enough on this page to build a graph from.' });
    try { await runQueuedRead(); } finally { graphImpl = was; }
    const s = await siteStatus(app, r.token);
    expect(s).toMatchObject({ status: 'read', card: { product_name: 'Acme' }, graph: null });
    expect(s.graph_failure).toMatch(/nothing specific enough/);
    expect(s.audit).not.toBeNull();
  });

  it('a graph read that THROWS is recorded as a failed graph, never as a failed card', async () => {
    const r = await submitSite(app, { website: 'graphthrows.test', ip: '6.6.6.8' });
    const was = graphImpl;
    graphImpl = async () => { throw new Error('LLM_VPS_UNREACHABLE: timeout'); };
    try { await runQueuedRead(); } finally { graphImpl = was; }
    const s = await siteStatus(app, r.token);
    expect(s).toMatchObject({ status: 'read', graph: null });
    expect(s.graph_failure).toMatch(/could not finish reading/);
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
    // …and the preview's graph is now the tenant's own
    expect(r.graph_written).toEqual({ nodes: 2, edges: 1, failed: 0 });
    const nodes = await owner.query(`SELECT label, name, properties->>'from' AS "from" FROM gt_kg_nodes WHERE tenant_id = $1 ORDER BY label`, [A]);
    expect(nodes.rows).toEqual([{ label: 'ICP', name: 'Plumbers', from: 'website preview' }, { label: 'Product', name: 'Acme', from: 'website preview' }]);
    const edges = await owner.query(`SELECT relationship FROM gt_kg_edges WHERE tenant_id = $1`, [A]);
    expect(edges.rows).toEqual([{ relationship: 'TARGETS' }]);
  });

  it('claiming again is harmless; another workspace cannot take it', async () => {
    expect(await claimSite(app, A, token)).toMatchObject({ already_claimed: true });
    await expect(claimSite(app, B, token)).rejects.toThrow(/ALREADY_CLAIMED/);
    const bSources = await owner.query(`SELECT count(*)::int n FROM gt_kb_sources WHERE tenant_id = $1`, [B]);
    expect(bSources.rows[0].n).toBe(0);
    expect((await owner.query(`SELECT count(*)::int n FROM gt_kg_nodes WHERE tenant_id = $1`, [B])).rows[0].n).toBe(0);
  });

  it('a failed or unknown preview has nothing to keep', async () => {
    const failedToken = (await submitSite(app, { website: 'broken.test', ip: '4.4.4.5' })).token;
    await expect(claimSite(app, B, failedToken)).rejects.toThrow(/NOT_READY/);
    await expect(claimSite(app, B, 'no-such-token')).rejects.toThrow(/NOT_FOUND/);
  });
});

d('request access (closed beta) — a lead in the FUNNEL_LEADS_TENANT_SLUG workspace', () => {
  const CONSENT = 'Vikuna may contact me about VaNi access. I can ask to be removed at any time.';
  const base = { name: 'Priya Rao', email: 'priya@acme.in', role_title: 'Founder', company: 'Acme',
    country_code: '+91', mobile: '98480 12345', consent_text: CONSENT };
  const events = () => owner.query(`SELECT e.payload, l.email, l.lead_no, l.phone FROM gt_lead_event e JOIN gt_lead l ON l.id = e.lead_id
    WHERE e.tenant_id = $1 AND e.event_type = 'access_requested' ORDER BY e.created_at`, [A]);

  it('switched off with a 503 naming the setting when FUNNEL_LEADS_TENANT_SLUG is missing', async () => {
    delete process.env.FUNNEL_LEADS_TENANT_SLUG;
    try { await expect(requestAccess(app, { ...base, ip: '10.0.0.1' })).rejects.toThrow(/FUNNEL_LEADS_TENANT_SLUG/); }
    finally { process.env.FUNNEL_LEADS_TENANT_SLUG = 'fa'; }
  });

  it('refuses what it cannot record, with the reason', async () => {
    await expect(requestAccess(app, { ...base, email: 'not-an-email', ip: '10.0.0.1' })).rejects.toThrow(/valid work email/);
    await expect(requestAccess(app, { ...base, role_title: ' ', ip: '10.0.0.1' })).rejects.toThrow(/Your role is required/);
    await expect(requestAccess(app, { ...base, consent_text: '', ip: '10.0.0.1' })).rejects.toThrow(/Consent is required/);
    expect((await events()).rows).toHaveLength(0);
  });

  it('writes one lead and one event: the site from the SESSION, the code and mobile apart, the exact consent words', async () => {
    const token = (await submitSite(app, { website: 'contractnest.com', ip: '10.0.0.9' })).token;
    const r = await requestAccess(app, { ...base, token, ip: '10.0.0.2', idempotencyKey: 'funnel.request_access.1.abc' });
    expect(r).toEqual({ received: true, replayed: false });
    const rows = (await events()).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: 'priya@acme.in', phone: '98480 12345' });
    expect(rows[0].lead_no).toBeTruthy();
    expect(rows[0].payload).toMatchObject({ site: 'contractnest.com', country_code: '+91', mobile: '98480 12345', consent_text: CONSENT, repeat: false });
    expect(JSON.stringify(rows[0].payload)).not.toContain('10.0.0.2');   // the IP is only ever a hash
  });

  it('the same request again (same key, same email) replays — no second event', async () => {
    const r = await requestAccess(app, { ...base, ip: '10.0.0.2', idempotencyKey: 'funnel.request_access.1.abc' });
    expect(r).toEqual({ received: true, replayed: true });
    expect((await events()).rows).toHaveLength(1);
  });

  it('another person whose browser minted the SAME key is not swallowed by the replay', async () => {
    await requestAccess(app, { ...base, name: 'Arun', email: 'arun@other.in', ip: '10.0.0.3', idempotencyKey: 'funnel.request_access.1.abc' });
    const emails = (await events()).rows.map((x) => x.email);
    expect(emails).toEqual(['priya@acme.in', 'arun@other.in']);
  });

  it('the same email asking again is one lead with two events, not two leads', async () => {
    await requestAccess(app, { ...base, email: 'PRIYA@acme.in', ip: '10.0.0.4', idempotencyKey: 'funnel.request_access.2.def' });
    const leads = await owner.query(`SELECT count(*)::int n FROM gt_lead WHERE tenant_id = $1 AND lower(email) = 'priya@acme.in'`, [A]);
    expect(leads.rows[0].n).toBe(1);
    const rows = (await events()).rows.filter((x) => x.email === 'priya@acme.in');
    expect(rows.map((x) => x.payload.repeat)).toEqual([false, true]);
  });

  it('the per-IP ceiling applies to requests too', async () => {
    await requestAccess(app, { ...base, email: 'a1@x.in', ip: '10.0.0.5' });
    await requestAccess(app, { ...base, email: 'a2@x.in', ip: '10.0.0.5' });
    await expect(requestAccess(app, { ...base, email: 'a3@x.in', ip: '10.0.0.5' })).rejects.toThrow(/RATE_LIMITED/);
  });

  it('list_requests: the owner workspace sees them; another workspace sees none (valid / other tenant)', async () => {
    const ctx = (tenant: string) => ({ tenant_id: tenant, is_live: true, user_id: null, db: createTenantDb(app, tenant) }) as never;
    const mine = await list_requests({}, ctx(A));
    expect(mine.requests.map((x) => x.email)).toEqual(['a2@x.in', 'a1@x.in', 'priya@acme.in', 'arun@other.in']);
    expect(mine.requests.find((x) => x.email === 'priya@acme.in')).toMatchObject({ times_asked: 2, site: null, country_code: '+91' });
    expect((await list_requests({}, ctx(B))).requests).toEqual([]);
  });

  it('empty: a workspace with no requests gets an empty list, not an error', async () => {
    const ctx = { tenant_id: funnelTenant, is_live: true, user_id: null, db: createTenantDb(app, funnelTenant) } as never;
    expect(await list_requests({}, ctx)).toEqual({ requests: [], total: 0, recipe: 'access-requests' });
  });
});
