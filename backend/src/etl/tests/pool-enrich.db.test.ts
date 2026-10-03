/**
 * Enriching the common pool end to end (release 4, prototype p2c-pool-enrich.html),
 * on the REAL schema, as the app role. The websites and the two model calls are
 * scripted; everything else — the slice, the record limit, the two enrichment
 * loads, re-derivation, the Complete test, scores, the pool graph, withdraw —
 * is the real code. What it proves:
 *
 *   - a live site is read: industry, type, what it does, contacts — each value
 *     labelled with its run, page and model (tab 5)
 *   - a delivery beats the site on a conflict, and both are kept (E1)
 *   - a named person's mailbox never becomes a pool fact
 *   - below the confidence floor nothing is written; nothing above it = abstained
 *   - JavaScript-only (E6), parked and down sites are named, not guessed at
 *   - the run view and the workbench count what happened (tabs 1, 3, 4)
 *   - a restart of the same event resumes, reading nobody twice
 *   - records a day (E4) refuse a run past the limit
 *   - no model left → the run stops, says so, and releases what it did not reach
 *   - withdraw takes every value and graph fact back; delivered data stays
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';

let mockPool: Pool | undefined;
jest.mock('../../db/pool', () => ({ getPool: () => mockPool }));

// The websites: scripted pages, read by the REAL extraction.
const PAGES: Record<string, string | Error> = {};
jest.mock('../../lib/site-reader', () => {
  const actual = jest.requireActual('../../lib/site-reader');
  return {
    ...actual,
    fetchUrlText: jest.fn(async (url: string) => {
      const page = PAGES[url.replace(/\/$/, '')];
      if (page === undefined || page instanceof Error) throw new Error(`URL_FETCH_FAILED: ${url} — ${page instanceof Error ? page.message : 'getaddrinfo ENOTFOUND'}`);
      return { ...actual.extractFromHtml(page), html: page };
    }),
  };
});

// The models: scripted answers, recorded in gt_llm_calls exactly as the router records them.
type Answer = Record<string, unknown> | Error;
const READINGS: Record<string, Answer> = {};
let contactsAnswer: (values: string[]) => string[] = (v) => v;
const nextRead: { throws: Error | null } = { throws: null };   // the next pool_read call fails once
jest.mock('../../agent-core/llm.client', () => {
  const actual = jest.requireActual('../../agent-core/llm.client');
  return {
    ...actual,
    callLLMValidated: jest.fn(async (o: any, schema: any) => {
      expect(o.meter).toBe('pool');
      expect(o.dataClass).toBe('public_company');
      const name = String(o.messages[0].content).match(/^Company: (.+?) \(/)?.[1] ?? '';
      let ans: Answer;
      if (o.step === 'pool_contacts') {
        const values = [...String(o.messages[0].content).matchAll(/^- \w+: (.+?)  \(on /gm)].map((m) => m[1]);
        ans = { own: contactsAnswer(values) };
      } else if (nextRead.throws) { ans = nextRead.throws; nextRead.throws = null; }
      else ans = READINGS[name] ?? new Error(`no reading scripted for ${name}`);
      if (ans instanceof Error) throw ans;
      const provider = o.step === 'pool_read' ? 'groq' : 'qwen';
      const model = provider === 'groq' ? 'openai/gpt-oss-120b' : 'qwen3';
      const { withTenantClient } = jest.requireActual('../../db');
      await withTenantClient(o.pool, o.tenantId, (c: any) => c.query(
        `INSERT INTO gt_llm_calls (tenant_id, run_id, purpose, step, route, rung, provider_code, model, data_class, prompt_tokens, answer_tokens, outcome)
         VALUES ($1, $2, 'enrichment', $3, $4, 1, $5, $6, 'public_company', 2000, 300, 'ok')`,
        [o.tenantId, String(o.runId), o.step, o.route, provider, model]));
      o.onServed?.({ provider, model, inputTokens: 2000, outputTokens: 300 });
      return schema.parse(ans);
    }),
  };
});

import { createRun } from '../../agent-core/agent.runner';
import { resolveChunk } from '../pool-merge';
import { countSlice, recordsUsedToday, runPoolEnrichJob } from '../pool-enrich';
import { readPoolGraph } from '../pool-graph';
import { workbench } from '../../skills/pool-skill/functions/workbench';
import { enrich_estimate } from '../../skills/pool-skill/functions/enrich-estimate';
import { start_enrich } from '../../skills/pool-skill/functions/start-enrich';
import { enrich_run } from '../../skills/pool-skill/functions/enrich-run';
import { withdraw_enrich_run } from '../../skills/pool-skill/functions/withdraw-enrich-run';
import { stop_enrich_run } from '../../skills/pool-skill/functions/stop-enrich-run';
import { saveCheckpoint } from '../../agent-core/agent.runner';
import { company } from '../../skills/pool-skill/functions/company';
import { createTenantDb } from '../../db';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'pool_enrich_test';
const BACKEND = path.resolve(__dirname, '../../..');
const ADMIN_T = '88888888-8888-8888-8888-888888888888';

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;
let owner: Pool; let app: Pool;
let delivery: string; let industry: string;
const ids: Record<string, string> = {};
const ctx = (admin = true) => ({ tenant_id: ADMIN_T, is_live: false, user_id: 'admin-user', role: 'owner', is_admin: admin, db: createTenantDb(app, ADMIN_T) }) as never;

const page = (body: string, links = '') => `<html><head><title>${body.slice(0, 40)}</title></head><body><nav>${links}</nav>${body}</body></html>`;
const PROSE = 'We make HPLC columns, vials and filters for quality-control laboratories across India, shipped from Hyderabad within two days. '.repeat(3);

async function runEvent(eventId: string) {
  const runId = await createRun(app, ADMIN_T, 'POOL_ENRICH_REQUESTED', eventId,
    (await app.query(`SELECT payload FROM gt_events WHERE id = $1`, [eventId])).rows[0].payload);
  await app.query(`UPDATE gt_agent_runs SET status = 'running', started_at = now() WHERE id = $1`, [runId]);
  const payload = (await app.query(`SELECT payload FROM gt_events WHERE id = $1`, [eventId])).rows[0].payload;
  await runPoolEnrichJob(app, ADMIN_T, payload, runId);
  await app.query(`UPDATE gt_agent_runs SET status = 'completed', completed_at = now(), duration_ms = 1000 WHERE id = $1`, [runId]);
  await app.query(`UPDATE gt_events SET status = 'done', processed_at = now() WHERE id = $1`, [eventId]);   // as the worker resolves it
  return runId;
}

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
    INSERT INTO vn_tenants (id, slug, is_admin) VALUES ('${ADMIN_T}', 'pool-admin', true);
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vanigtm_app;`);
  // The admin switches the scripted models on (the router's state is read for the plan and the estimate).
  await owner.query(`INSERT INTO gt_llm_provider_switch (provider_code, purpose, enabled) VALUES ('qwen', 'enrichment', true)`);
  industry = (await owner.query(`SELECT name FROM gt_industries WHERE is_active ORDER BY id LIMIT 1`)).rows[0].name;
  const src = (await owner.query(`SELECT id FROM gt_data_sources WHERE code = 'ftcci'`)).rows[0].id;
  delivery = (await owner.query(`INSERT INTO gt_source_loads (source_id, label, as_of) VALUES ($1, 'FTCCI · Members', '2023-10-01') RETURNING id::text`, [src])).rows[0].id;
  const rows: Array<[string, string, string | null]> = [
    ['Kavya Lab Instruments Pvt Ltd', 'kavyalab.example', '+91 40 2345 6789'],
    ['Nizam Analytical', 'nizam.example', null],
    ['Sri Lakshmi Traders', 'lakshmitraders.example', null],
    ['Deccan Biologics', 'deccan.example', null],
    ['Unsure Industries', 'unsure.example', null],
    ['Hitech Glassware', 'hitech.example', null],
  ];
  for (const [i, [name, domain, phone]] of rows.entries()) {
    await owner.query(
      `INSERT INTO gt_universe_company_sources (source_id, load_id, source_record_id, name, domain_normalized, city, state_code, pin, phone, industry_raw)
       VALUES ($1, $2, $3, $4, $5, 'Hyderabad', 'TG', '50003${i}', $6, 'Chemicals & Scientific')`,
      [src, delivery, `r${i}`, name, domain, phone]);
  }
  while (await resolveChunk(owner, Number(delivery))) { /* drain */ }
  for (const r of (await owner.query(`SELECT id::text, domain_normalized FROM gt_universe_companies`)).rows) ids[r.domain_normalized] = r.id;
  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
  mockPool = app;

  // The websites.
  const nav = '<a href="/about-us">About us</a><a href="/contact">Contact</a><a href="/products">Products</a>';
  PAGES['https://kavyalab.example'] = page(`<h1>Kavya Lab</h1><p>${PROSE}</p><footer><a href="https://www.linkedin.com/company/kavya-lab">LinkedIn</a> Site by <a href="mailto:info@webcraft.example">WebCraft</a></footer>`, nav);
  PAGES['https://kavyalab.example/about-us'] = page(`<p>${PROSE} Founded 2004, an instruments company.</p>`);
  PAGES['https://kavyalab.example/contact'] = page(`<p>${PROSE}</p><p>Write to sales@kavyalab.example or rajesh@kavyalab.example. Call +91 40 2345 0000.</p>`);
  PAGES['https://kavyalab.example/products'] = page(`<p>${PROSE}</p>`);
  PAGES['https://nizam.example'] = '<html><body><div id="root"></div><script src="/app.js"></script></body></html>';
  PAGES['https://lakshmitraders.example'] = page(`<p>This domain is for sale. Buy this domain today. ${PROSE}</p>`);
  PAGES['https://deccan.example'] = new Error('ECONNREFUSED');
  PAGES['http://deccan.example'] = new Error('ECONNREFUSED');
  PAGES['https://unsure.example'] = page(`<p>${PROSE}</p>`);
  PAGES['https://hitech.example'] = page(`<p>${PROSE}</p>`);
  READINGS['Kavya Lab Instruments Pvt Ltd'] = {
    what_it_does: 'HPLC columns and lab consumables for QC labs', industry, is_individual: false, b2b_b2c: 'b2b', employees_band: '11-50',
    pages: { what_it_does: '/products', industry: '/about-us', is_individual: '/about-us', employees_band: '/about-us' },
    confidence: { what_it_does: 0.88, industry: 0.91, is_individual: 0.95, employees_band: 0.4 },
    graph: { nodes: [{ label: 'Product', name: 'HPLC columns', description: 'C18 columns' }, { label: 'ICP', name: 'QC labs', description: 'pharma QC' }],
      edges: [{ from: { label: 'Product', name: 'HPLC columns' }, relationship: 'TARGETS', to: { label: 'ICP', name: 'QC labs' } }] },
  };
  READINGS['Unsure Industries'] = {
    what_it_does: 'Something', industry, is_individual: false, pages: {}, confidence: { what_it_does: 0.3, industry: 0.2, is_individual: 0.4, employees_band: 0 },
  };
  READINGS['Hitech Glassware'] = new Error('LLM_ROUTE_EXHAUSTED: route high for public company data has no provider left — groq: today\'s tokens spent; qwen: switched off. Nothing was guessed.');
}, 180000);
afterAll(async () => { if (app) await app.end(); if (owner) await owner.end(); });

let eventId: string;

d('enriching the common pool', () => {
  it('the workbench sees the slice and suggests it (tab 1)', async () => {
    const w: any = await workbench({}, ctx());
    expect(w.total).toBe(6);
    expect(w.with_website).toBe(6);
    expect(w.limit).toMatchObject({ daily: 5000, used: 0, left: 5000 });
    expect(w.gaps.find((g: any) => g.key === 'industry').companies).toBe(6);
    expect(w.suggestion).toMatchObject({ delivery, eligible: 6, records: 6 });
    expect(w.runs).toEqual([]);
    await expect(workbench({}, ctx(false))).rejects.toThrow(/admin/);
  });

  it('estimates a run (tab 2) and refuses one past the record limit (E4)', async () => {
    const e: any = await enrich_estimate({ delivery, records: 100 }, ctx());
    expect(e.matched).toBe(6);
    expect(e.estimate.records).toBe(6);
    expect(e.estimate.providers.find((p: any) => p.code === 'qwen')).toMatchObject({ companies: 6, off: false });
    process.env.ENRICH_POOL_DAILY_RECORDS = '3';
    try { await expect(start_enrich({ delivery, records: 5 }, ctx())).rejects.toThrow(/DAILY_RECORDS_SPENT/); }
    finally { process.env.ENRICH_POOL_DAILY_RECORDS = '5000'; }
  });

  it('refuses to start when a route the run needs has no model switched on, and the estimate says so', async () => {
    await owner.query(`INSERT INTO gt_llm_provider_switch (provider_code, purpose, enabled) VALUES ('qwen', 'enrichment', false)`);
    try {
      const e: any = await enrich_estimate({ delivery, records: 5 }, ctx());
      expect(e.estimate.blocked).toMatch(/route HIGH .* has no model switched on; route LOW/);
      await expect(start_enrich({ delivery, records: 5 }, ctx())).rejects.toThrow(/ROUTE_HAS_NO_MODEL/);
    } finally {
      await owner.query(`INSERT INTO gt_llm_provider_switch (provider_code, purpose, enabled) VALUES ('qwen', 'enrichment', true)`);
    }
  });

  it('starts a run: records are reserved today', async () => {
    const r: any = await start_enrich({ delivery, records: 5 }, ctx());
    expect(r).toMatchObject({ run_no: 1, records: 5 });
    eventId = r.event_id;
    expect(await recordsUsedToday(app)).toBe(5);
    // Promised to this run: no second run may take the same companies while it waits or reads.
    expect(await countSlice(app, { delivery, raw_or_identified: false, industry_missing: false })).toBe(1);
  });

  it('reads each company and names what it could not read (tabs 3, 4)', async () => {
    await runEvent(eventId);
    const { run }: any = await enrich_run({ event_id: eventId }, ctx());
    expect(run.status).toBe('finished');
    expect(run.counts).toMatchObject({ read: 1, js_only: 1, not_live: 2, abstained: 1, unreadable: 3 });
    expect(run.progress).toEqual({ done: 5, total: 5 });
    expect(run.feed.map((f: any) => f.kind)).toEqual(expect.arrayContaining(['plan', 'check', 'read', 'skip', 'bad', 'done']));
    expect(run.feed.find((f: any) => f.kind === 'read')).toMatchObject({ text: expect.stringContaining('/about-us, /contact, /products'), model: 'groq · openai/gpt-oss-120b' });
    expect(run.models.find((m: any) => m.provider === 'groq')).toMatchObject({ companies: 2, tokens: 4600 });
    expect(run.paid_tokens).toBe(0);
    expect(run.now.avg).toBeGreaterThan(run.before.avg);
  });

  it('a read company: facts with page, model and confidence; a delivery wins the phone; no person\'s mailbox (tab 5)', async () => {
    const c = (await owner.query(`SELECT * FROM gt_universe_companies WHERE id = $1`, [ids['kavyalab.example']])).rows[0];
    expect(c).toMatchObject({ domain_status: 'found', is_individual: false, description: 'HPLC columns and lab consumables for QC labs', employees_band: null });
    expect(c.industry_id).not.toBeNull();
    expect(c.phone).toBe('+91 40 2345 6789');               // the delivery's, not the site's
    expect(c.role_emails).toEqual(['sales@kavyalab.example']); // never rajesh@, never the web agency's
    expect(c.linkedin_url).toBe('https://www.linkedin.com/company/kavya-lab');
    expect(['qualified', 'reachable']).toContain(c.coverage_parts.level);
    const { provenance }: any = await company({ company_id: ids['kavyalab.example'] }, ctx());
    const row = (label: string) => provenance.rows.find((r: any) => r.label === label);
    expect(row('Industry')).toMatchObject({ value: industry, from: 'run #1 · /about-us · groq · openai/gpt-oss-120b · 0.91' });
    expect(row('Industry (raw)')).toMatchObject({ value: '"Chemicals & Scientific"', from: 'FTCCI member directory delivery · kept as delivered' });
    expect(row('Phone')).toMatchObject({ value: '+91 40 2345 6789', wins_over: '+91 40 2345 0000' });
    expect(row('Company email')).toMatchObject({ value: 'sales@kavyalab.example', from: 'run #1 · /contact · page text' });
    expect(row('LinkedIn').from).toBe('run #1 · site footer · code');
    expect(row('What it does').from).toBe('run #1 · /products · groq · openai/gpt-oss-120b · 0.88');
    expect(provenance.enrichment).toMatchObject({ run_no: 1, site: 'live' });
    const g = await readPoolGraph(app, ids['kavyalab.example']);
    expect(g.nodes.map((n) => n.name).sort()).toEqual(['HPLC columns', 'QC labs']);
  });

  it('JavaScript-only, parked, down and unsure: named, nothing guessed', async () => {
    const get = async (d: string) => (await owner.query(`SELECT domain_status, is_individual, industry_id FROM gt_universe_companies WHERE id = $1`, [ids[d]])).rows[0];
    expect(await get('nizam.example')).toMatchObject({ domain_status: 'found', is_individual: null });      // live, but nothing to read
    expect(await get('lakshmitraders.example')).toMatchObject({ domain_status: null });                   // parked
    expect(await get('deccan.example')).toMatchObject({ domain_status: null });                           // down
    expect(await get('unsure.example')).toMatchObject({ is_individual: null, industry_id: null });          // abstained
    const llm = (await owner.query(`SELECT count(*)::int n FROM gt_universe_company_sources s JOIN gt_data_sources d ON d.id = s.source_id
      WHERE d.code = 'llm_pass' AND s.company_id = $1`, [ids['unsure.example']])).rows[0].n;
    expect(llm).toBe(0);
  });

  it('a read company leaves the slice; the workbench lists the run', async () => {
    expect(await countSlice(app, { delivery, raw_or_identified: false, industry_missing: false })).toBe(1);   // only Hitech is left
    const w: any = await workbench({}, ctx());
    expect(w.runs[0]).toMatchObject({ run_no: 1, records: 5, status: 'finished' });
    expect(w.limit.used).toBe(5);
  });

  it('a restart of the same event resumes and reads nobody twice', async () => {
    const { fetchUrlText } = jest.requireMock('../../lib/site-reader');
    const before = (fetchUrlText as jest.Mock).mock.calls.length;
    await runEvent(eventId);
    expect((fetchUrlText as jest.Mock).mock.calls.length).toBe(before);
    const { run }: any = await enrich_run({ event_id: eventId }, ctx());
    expect(run.feed.some((f: any) => f.kind === 'restore')).toBe(true);
  });

  it('no model left: the run stops, says so, and releases the records it did not reach', async () => {
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    await runEvent(r.event_id);
    const { run }: any = await enrich_run({ event_id: r.event_id }, ctx());
    expect(run.status).toBe('stopped');
    expect(run.stopped).toMatch(/LLM_ROUTE_EXHAUSTED/);
    expect(run.counts.not_reached).toBe(1);
    expect(await recordsUsedToday(app)).toBe(5);   // run 2 reached nobody
  });

  it('a run stopped before a worker takes it never starts, and uses no records', async () => {
    const before = await recordsUsedToday(app);
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    expect(await recordsUsedToday(app)).toBe(before + 1);
    expect(await stop_enrich_run({ event_id: r.event_id }, ctx())).toMatchObject({ stopped: 'before_start' });
    expect(await recordsUsedToday(app)).toBe(before);
    const { run }: any = await enrich_run({ event_id: r.event_id }, ctx());
    expect(run.status).toBe('stopped');
    expect((await owner.query(`SELECT status FROM gt_events WHERE id = $1`, [r.event_id])).rows[0].status).toBe('failed');   // the worker will not claim it
  });

  it('a running run stops before the next company, and says a person stopped it', async () => {
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    const payload = (await app.query(`SELECT payload FROM gt_events WHERE id = $1`, [r.event_id])).rows[0].payload;
    const runId = await createRun(app, ADMIN_T, 'POOL_ENRICH_REQUESTED', r.event_id, payload);
    await app.query(`UPDATE gt_agent_runs SET status = 'running', started_at = now() WHERE id = $1`, [runId]);
    // A live worker: the event is claimed and its heartbeat is fresh.
    await app.query(`UPDATE gt_events SET status = 'processing', started_at = now() WHERE id = $1`, [r.event_id]);
    expect(await stop_enrich_run({ event_id: r.event_id }, ctx())).toMatchObject({ stopped: 'requested' });
    await runPoolEnrichJob(app, ADMIN_T, payload, runId);
    await app.query(`UPDATE gt_agent_runs SET status = 'completed', completed_at = now() WHERE id = $1`, [runId]);
    await app.query(`UPDATE gt_events SET status = 'done', processed_at = now() WHERE id = $1`, [r.event_id]);
    const { run }: any = await enrich_run({ event_id: r.event_id }, ctx());
    expect(run).toMatchObject({ status: 'stopped', progress: { done: 0, total: 1 } });
    expect(run.stopped).toMatch(/STOPPED_BY_PERSON/);
    expect(run.counts.not_reached).toBe(1);
    await expect(stop_enrich_run({ event_id: r.event_id }, ctx())).rejects.toThrow(/NOT_RUNNING/);
    void saveCheckpoint;
  });

  it('one run at a time: a second start is refused while one is queued', async () => {
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    await expect(start_enrich({ delivery, records: 1 }, ctx())).rejects.toThrow(/ANOTHER_RUN_ACTIVE: Run #\d+ is still queued or running/);
    await stop_enrich_run({ event_id: r.event_id }, ctx());
  });

  it('a run left "running" by a worker that died shows as stalled, and Stop closes it at once', async () => {
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    const payload = (await app.query(`SELECT payload FROM gt_events WHERE id = $1`, [r.event_id])).rows[0].payload;
    const runId = await createRun(app, ADMIN_T, 'POOL_ENRICH_REQUESTED', r.event_id, payload);
    await app.query(`UPDATE gt_agent_runs SET status = 'running', started_at = now() - interval '12 hours' WHERE id = $1`, [runId]);
    await app.query(`UPDATE gt_events SET status = 'processing', started_at = now() - interval '12 hours' WHERE id = $1`, [r.event_id]);
    expect((await enrich_run({ event_id: r.event_id }, ctx()) as any).run.status).toBe('stalled');
    expect(await stop_enrich_run({ event_id: r.event_id }, ctx())).toMatchObject({ stopped: 'closed' });
    const { run }: any = await enrich_run({ event_id: r.event_id }, ctx());
    expect(run.status).toBe('stopped');
    expect((await owner.query(`SELECT status FROM gt_events WHERE id = $1`, [r.event_id])).rows[0].status).toBe('failed');
    expect(await start_enrich({ delivery, records: 1 }, ctx()).then((x: any) => stop_enrich_run({ event_id: x.event_id }, ctx()))).toMatchObject({ stopped: 'before_start' });   // free to start again
  });

  it('withdraw takes every value and graph fact back; delivered data stays', async () => {
    const w: any = await withdraw_enrich_run({ event_id: eventId }, ctx());
    expect(w).toMatchObject({ run_no: 1, companies_rescored: 5 });
    const c = (await owner.query(`SELECT * FROM gt_universe_companies WHERE id = $1`, [ids['kavyalab.example']])).rows[0];
    expect(c).toMatchObject({ domain_status: null, is_individual: null, industry_id: null, description: null, phone: '+91 40 2345 6789' });
    expect(c.role_emails).toEqual([]);
    expect((await readPoolGraph(app, ids['kavyalab.example'])).nodes).toEqual([]);
    const { run }: any = await enrich_run({ event_id: eventId }, ctx());
    expect(run.status).toBe('withdrawn');
    expect(run.now.avg).toBeGreaterThan(run.before.avg);   // "what it did" still reads as it was
    await expect(withdraw_enrich_run({ event_id: eventId }, ctx())).rejects.toThrow(/ALREADY_WITHDRAWN/);
    expect(await countSlice(app, { delivery, raw_or_identified: false, industry_missing: false })).toBe(6);  // readable again
  });

  it('every model briefly rate-limited: the run waits, says so, and reads the same company again', async () => {
    for (const n of Object.keys(READINGS)) READINGS[n] = READINGS['Kavya Lab Instruments Pvt Ltd'];
    // qwen answered 429 a moment ago: cooling down for two seconds.
    await owner.query(
      `INSERT INTO gt_llm_calls (tenant_id, purpose, step, route, rung, provider_code, model, data_class, prompt_tokens, answer_tokens, outcome, cooldown_until)
       VALUES ($1, 'enrichment', 'pool_read', 'high', 1, 'qwen', 'qwen3', 'public_company', 0, 0, 'rate_limited', now() + interval '2 seconds')`, [ADMIN_T]);
    nextRead.throws = new Error('LLM_ROUTE_EXHAUSTED: route high for public company data has no provider left — qwen: cooling down. Nothing was guessed.');
    const r: any = await start_enrich({ delivery, records: 1 }, ctx());
    await runEvent(r.event_id);
    const { run }: any = await enrich_run({ event_id: r.event_id }, ctx());
    expect(run.status).toBe('finished');
    expect(run.stopped).toBeNull();
    expect(run.counts.read).toBe(1);
    expect(run.feed.find((f: any) => f.kind === 'wait').text).toMatch(/rate-limited — waiting \d+s, until \d\d:\d\d:\d\d UTC, then trying the same company again/);
  }, 30000);
});
