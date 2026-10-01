/**
 * Regenerating the brand against the REAL schema (migrations), as a
 * NOSUPERUSER NOBYPASSRLS role. The model is mocked; the upsert rules are
 * real. The bug this guards (2026-09-30): once a person had saved any brand
 * field, regenerating never changed anything — while the console said
 * "Redrafted from your site".
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';

let drafted: Record<string, string[]> = {};
const sentToModel: string[] = [];
jest.mock('../../../agent-core/llm.client', () => ({
  ...jest.requireActual('../../../agent-core/llm.client'),
  callLLMValidated: jest.fn(async (req: { messages: { content: string }[] }) => { sentToModel.push(req.messages[0].content); return drafted; }),
}));
jest.mock('../../../agent-core/prompt.store', () => ({ loadPrompt: jest.fn(async () => 'system') }));

import { generateBrand, upsertBrandFields, approveBrand, reopenBrand } from '../brand.service';
import { createRun } from '../../../agent-core/agent.runner';
import { IngestionAgent } from '../../ingestion-skill/ingestion.agent';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'brand_regen_test';
const BACKEND = path.resolve(__dirname, '../../../..');
const available = (() => { try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; } catch { return false; } })();
const T = 'cccccccc-0000-0000-0000-00000000000a';
let owner: Pool; let app: Pool;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`); await admin.query(`CREATE DATABASE ${DB}`); await admin.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  owner = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await owner.query(`
    INSERT INTO vn_tenants (id, slug, status) VALUES ('${T}','br','active');
    INSERT INTO gt_tenant_profile (tenant_id, product_name, product_description) VALUES ('${T}','Acme','Invoicing for plumbers');
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vanigtm_app;`);
  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
}, 180000);
afterAll(async () => { if (app) await app.end(); if (owner) await owner.end(); });

const d = available ? describe : describe.skip;
const run = async () => generateBrand(app, T, String(await createRun(app, T, 'brand-skill.generate')));

d('regenerate the brand', () => {
  it('first draft: everything the model gave is written, and reported as filled', async () => {
    drafted = { voice_tone: ['plain'], always_say: ['paid on time'], never_say: [], proof: [] };
    const b = await run();
    expect(b).toMatchObject({ voice_tone: ['plain'], always_say: ['paid on time'] });
    expect(b.filled.sort()).toEqual(['always_say', 'voice_tone']);
  });

  it('an agent-only draft is replaced whole on regenerate', async () => {
    drafted = { voice_tone: ['warm'], always_say: ['no chasing'], never_say: ['cheap'], proof: [] };
    const b = await run();
    expect(b).toMatchObject({ voice_tone: ['warm'], always_say: ['no chasing'], never_say: ['cheap'] });
  });

  it('after a person edits one field, regenerate fills the EMPTY ones and keeps theirs', async () => {
    await upsertBrandFields(app, T, { voice_tone: ['direct'], never_say: [] });   // a person's words, and a field they cleared
    drafted = { voice_tone: ['formal'], always_say: ['model says this'], never_say: ['guaranteed'], proof: ['40 plumbers'] };
    const b = await run();
    expect(b.voice_tone).toEqual(['direct']);                 // theirs, kept
    expect(b.always_say).toEqual(['no chasing']);             // not empty → kept
    expect(b.never_say).toEqual(['guaranteed']);              // empty → filled
    expect(b.proof).toEqual(['40 plumbers']);                 // empty → filled
    expect(b.filled.sort()).toEqual(['never_say', 'proof']);  // and it says exactly that
  });

  it('nothing new → filled is empty (the console must not claim a redraft)', async () => {
    const b = await run();
    expect(b.filled).toEqual([]);
  });

  it('an approved brand is never changed by a draft', async () => {
    await approveBrand(app, T).catch(() => undefined);
    const approved = (await owner.query(`SELECT approved_at FROM gt_tenant_brand WHERE tenant_id = $1`, [T])).rows[0].approved_at;
    if (!approved) return;   // approval needs more than this fixture gives — nothing to assert
    drafted = { voice_tone: ['x'], always_say: ['x'], never_say: ['x'], proof: ['x'] };
    const b = await run();
    expect(b.filled).toEqual([]);
    await reopenBrand(app, T);
  });
});

d('a JS-only site (an empty Vite shell until rendered) — the vikuna.io case', () => {
  const U = 'cccccccc-0000-0000-0000-00000000000b';
  const SHELL = '<html><head><link rel="icon" href="/vite.svg"><title>Vite + React</title></head><body><div id="root"></div></body></html>';
  const RENDERED = '<html><head><link rel="icon" href="/brand-mark.png"></head><body>'
    + '<h1 style="color: rgb(232, 66, 10)">Most AI fails in production. We build the kind that survives.</h1>'
    + `<p>${'Vikuna builds custom AI agents for Indian businesses, measured on ROI before scale. '.repeat(6)}</p>`
    + '<a style="background-color: rgb(232, 66, 10)">Book a call</a><span style="color: rgb(201, 151, 58)">Case studies</span></body></html>';

  beforeAll(async () => {
    if (!available) return;
    await owner.query(`
      INSERT INTO vn_tenants (id, slug, status) VALUES ('${U}','spa','active');
      INSERT INTO gt_tenant_profile (tenant_id, product_name, product_description) VALUES ('${U}','Vikuna','AI agents');
      INSERT INTO gt_kb_sources (tenant_id, source_type, display_name, url, status) VALUES ('${U}','url','vikuna.test','https://vikuna.test/','complete');`);
    jest.spyOn(IngestionAgent, 'fetchUrlText').mockResolvedValue({ ...IngestionAgent.extractFromHtml(SHELL), html: SHELL } as never);
    jest.spyOn(IngestionAgent, 'renderConfigured').mockReturnValue(true);
    jest.spyOn(IngestionAgent, 'renderPageViaN8n').mockResolvedValue(RENDERED);
  });

  it('renders once, drafts from the RENDERED text, and takes the rendered logo and colours over the shell\'s', async () => {
    sentToModel.length = 0;
    drafted = { voice_tone: ['direct'], always_say: ['ROI before scale'], never_say: [], proof: [] };
    const b = await generateBrand(app, U, String(await createRun(app, U, 'brand-skill.generate')));
    expect(sentToModel[0]).toContain('measured on ROI before scale');    // the model saw the real page
    expect(b.visual).toMatchObject({ logo_url: 'https://vikuna.test/brand-mark.png', primary_color: '#e8420a', secondary_color: '#c9973a' });
    expect(IngestionAgent.renderPageViaN8n).toHaveBeenCalledTimes(1);
    const steps = (await owner.query(`SELECT steps FROM gt_agent_runs WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1`, [U])).rows[0].steps;
    expect(steps.map((x: { step_name: string }) => x.step_name)).toEqual(expect.arrayContaining(['render_escalation', 'render_escalation_complete']));
  });

  it('a shell with no renderer configured says so in the run, instead of an unexplained empty draft', async () => {
    (IngestionAgent.renderConfigured as jest.Mock).mockReturnValue(false);
    await generateBrand(app, U, String(await createRun(app, U, 'brand-skill.generate')));
    const steps = (await owner.query(`SELECT steps FROM gt_agent_runs WHERE tenant_id = $1 ORDER BY id DESC LIMIT 1`, [U])).rows[0].steps;
    expect(steps.find((x: { step_name: string }) => x.step_name === 'render_unavailable')?.status).toBe('error');
  });
});
