/**
 * Account research agent against a real PostgreSQL, with the network and the
 * LLM stubbed.
 *
 * What is being tested is the AGENT's contract, not the model's judgement:
 *   - a half-written offer catalogue costs ZERO crawls
 *   - an unreadable site produces a recorded gap, never a guessed brief
 *   - one bad account does not kill the batch
 *   - a crash mid-batch keeps what was earned
 *   - another tenant's prospects are untouchable
 *
 * Skips without a database (see landing.test.ts for how to start one).
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const A = '11111111-1111-1111-1111-111111111111';
const B = '33333333-3333-3333-3333-333333333333';

const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

/* ── Stubs ─────────────────────────────────────────────────────────────── */

const fetched: string[] = [];
let siteText: Record<string, string> = {};

jest.mock('../../ingestion-skill/ingestion.agent', () => ({
  IngestionAgent: {
    fetchUrlText: jest.fn(async (url: string) => {
      fetched.push(url);
      const text = siteText[url];
      if (text === undefined) throw new Error(`ENOTFOUND ${url}`);
      return { text, html: '<a href="/about">About</a>', health: { present: [], missing: [], summary: 'static ok' } };
    }),
    renderConfigured: () => false,
    renderPageViaN8n: jest.fn(),
    extractFromHtml: jest.fn(),
  },
}));

jest.mock('../../../agent-core/prompt.store', () => ({
  loadPrompt: jest.fn(async () => 'stub prompt'),
}));

let llmQueue: unknown[] = [];
jest.mock('../../../agent-core/llm.client', () => ({
  callLLMValidated: jest.fn(async () => {
    if (llmQueue.length === 0) throw new Error('stub LLM: nothing queued');
    return llmQueue.shift();
  }),
}));

import { AccountResearchAgent } from '../account.agent';

/* ── Schema ────────────────────────────────────────────────────────────── */

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_tags (id BIGSERIAL PRIMARY KEY, tenant_id UUID, label VARCHAR(80),
  is_active BOOLEAN DEFAULT true);
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255), website VARCHAR(500),
  industry_raw TEXT, completeness NUMERIC(4,3));
CREATE TABLE gt_prospect_tags (prospect_id BIGINT REFERENCES gt_prospects(id) ON DELETE CASCADE,
  tag_id BIGINT, tenant_id UUID, PRIMARY KEY (prospect_id, tag_id));
CREATE TABLE gt_agent_runs (id BIGSERIAL PRIMARY KEY, tenant_id UUID, agent_name TEXT,
  event_id TEXT, status TEXT DEFAULT 'queued', steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  checkpoint JSONB, awaiting_input JSONB, retry_count INT DEFAULT 0, last_checkpoint TEXT,
  output JSONB, error_trace TEXT, token_usage JSONB, duration_ms INT,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE gt_offers (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
  offer_key VARCHAR(60) NOT NULL, name VARCHAR(120) NOT NULL, one_line TEXT NOT NULL,
  who_for TEXT NOT NULL, problem TEXT NOT NULL, what_we_do TEXT[] NOT NULL DEFAULT '{}',
  signals TEXT[] NOT NULL DEFAULT '{}', disqualifiers TEXT[] NOT NULL DEFAULT '{}',
  price_band TEXT, proof TEXT, is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order SMALLINT NOT NULL DEFAULT 0, created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS account_brief_test');
  await admin.query('CREATE DATABASE account_brief_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'account_brief_test' });

  await pool.query(BASE);
  // The real migration, so the shipped constraints are what is tested.
  await pool.query(fs.readFileSync(path.join(MIGRATIONS, '207_gt_account_briefs.sql'), 'utf8'));

  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
  await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (7,$1,'Pilot Pharma')`, [A]);
  await pool.query(
    `INSERT INTO gt_prospects (id,tenant_id,is_live,name,domain_normalized,industry_raw,completeness)
     VALUES (1,$1,false,'Alpha API','alpha.com','Manufacturing of API',0.9),
            (2,$1,false,'Beta Drugs','beta.com','Manufacturing of Bulk Drugs',0.8),
            (3,$1,false,'Gamma NoWeb',NULL,'Manufacturing of API',0.5)`, [A]);
  await pool.query(
    `INSERT INTO gt_prospects (id,tenant_id,is_live,name,domain_normalized,industry_raw)
     VALUES (9,$1,false,'Their Co','theirs.com','Manufacturing of API')`, [B]);
  await pool.query(`INSERT INTO gt_prospect_tags VALUES (1,7,$1),(2,7,$1),(3,7,$1)`, [A]);
  await pool.query(`INSERT INTO gt_prospect_tags VALUES (9,7,$1)`, [B]);

  // Tenant A sells one COMPLETE offer. Tenant B's is deliberately
  // half-written — price_band and proof empty — which is what a real tenant
  // looks like the moment before someone fills them in.
  await pool.query(
    `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem,
                            what_we_do, signals, disqualifiers, price_band, proof)
     VALUES ($1,'cdo-as-a-service','CDO as a Service',
             'A fractional Chief Data Officer for pharma manufacturers.',
             'Mid-size pharma manufacturers with multiple plants.',
             'Data is trapped across plant and quality systems.',
             ARRAY['A single definition layer across plant systems'],
             ARRAY['More than one manufacturing site listed on the site'],
             ARRAY['Trading or distribution only, no manufacturing'],
             'INR 3-6 lakh per month for six months',
             'Delivered for two Hyderabad API manufacturers.')`, [A]);
  await pool.query(
    `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem,
                            what_we_do, signals, disqualifiers)
     VALUES ($1,'half-written','Half Written Offer',
             'An offer nobody finished writing down.',
             'Somebody, presumably, somewhere out there.',
             'A problem that was never actually described here.',
             ARRAY['Something we would do for them'],
             ARRAY['Something visible on their website'],
             ARRAY['Something that would rule them out'])`, [B]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(() => { fetched.length = 0; llmQueue = []; siteText = {}; });

async function newRun(tenantId = A): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO gt_agent_runs (tenant_id, agent_name, status)
     VALUES ($1,'ACCOUNT_RESEARCH_REQUESTED','running') RETURNING id::text`, [tenantId]);
  return r.rows[0].id;
}

/**
 * A page body long enough to be believed. MIN_USABLE_TEXT is 200 chars —
 * below that the agent treats the page as having said nothing, which is the
 * right behaviour for a real site and a trap for a short test fixture.
 */
const siteBody = (what: string) =>
  `Established in 1998, we operate two units in Medak district producing ${what}. `
  + 'Our facilities are built for regulated markets and we supply customers across India, '
  + 'South East Asia and Europe. Quality systems cover raw material control, in-process '
  + 'checks and finished goods release, with full batch documentation retained for every lot.';

const briefs = async (tenantId = A) => (await pool.query(
  `SELECT * FROM gt_account_briefs WHERE tenant_id = $1 ORDER BY prospect_id`, [tenantId])).rows;

/** The three stage responses for one healthy account. */
function queueHealthyAccount(excerpt: string, offer: string | null) {
  llmQueue.push({
    what_they_make: 'Active pharmaceutical ingredients',
    scale_signals: 'Two units in Medak',
    service_signals: 'not stated',
    digital_maturity: 'not stated',
    certifications: ['WHO-GMP'],
    named_contacts: [{ name: 'R Kumar', title: 'Director', email: 'r@alpha.com' }],
    evidence: [{ claim: 'Two units in Medak', url: 'https://alpha.com', excerpt }],
  });
  llmQueue.push({
    scores: [{ offer_id: 'cdo-as-a-service', score: offer ? 0.8 : 0.1, reason: 'Two units, no data lead' }],
    recommended_offer: offer, reason: 'Multi-site with no data leadership', confidence: 0.7,
  });
  if (offer) llmQueue.push({ hook: 'Two units in Medak, each with its own batch records.', evidence_url: 'https://alpha.com' });
}

const maybe = available ? describe : describe.skip;

maybe('the offer catalogue gate', () => {
  it('fails before crawling anything when the offers are half-written', async () => {
    const runId = await newRun(B);
    // Tenant B's offer has no price_band and no proof.
    await expect(AccountResearchAgent.run(pool, B,
      { tag_id: 7 }, runId)).rejects.toThrow(/not ready for fit scoring/);

    // THE assertion: a half-written catalogue costs zero crawls.
    expect(fetched).toHaveLength(0);
    expect(await briefs()).toHaveLength(0);

    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    expect(steps.some((s: any) => s.step_name === 'offer_catalogue' && s.status === 'error')).toBe(true);
  });

  it('fails loudly when the tenant sells nothing at all', async () => {
    await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'nothing') ON CONFLICT DO NOTHING`,
      ['77777777-7777-7777-7777-777777777777']);
    const runId = await newRun('77777777-7777-7777-7777-777777777777');
    await expect(AccountResearchAgent.run(pool, '77777777-7777-7777-7777-777777777777',
      { tag_id: 7 }, runId)).rejects.toThrow(/OFFER_CATALOGUE_EMPTY/);
    expect(fetched).toHaveLength(0);
  });

  it('fails loudly when no cohort is named', async () => {
    const runId = await newRun();
    await expect(AccountResearchAgent.run(pool, A, {}, runId))
      .rejects.toThrow(/COHORT_MISSING/);
  });
});

maybe('researching a cohort', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  it('writes a brief per reachable account and skips those with no domain', async () => {
    siteText = {
      'https://alpha.com': siteBody('active pharmaceutical ingredients'),
      'https://beta.com': siteBody('bulk drugs'),
    };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    queueHealthyAccount('two units in Medak district', null);

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { tag_id: 7 }, runId);

    const rows = await briefs();
    // Gamma has no domain: there is nothing to research, so it is not a row.
    expect(rows.map((r: any) => Number(r.prospect_id))).toEqual([1, 2]);
    expect(rows[0].status).toBe('drafted');
    expect(rows[0].recommended_offer).toBe('cdo-as-a-service');
    expect(rows[0].hook).toMatch(/Medak/);
    expect(rows[0].what_they_make).toBe('Active pharmaceutical ingredients');

    // "not stated" must not be stored as a fact.
    expect(rows[0].service_signals).toBeNull();
    expect(rows[0].digital_maturity).toBeNull();

    // No fit means no hook — there is nothing to open with.
    expect(rows[1].recommended_offer).toBeNull();
    expect(rows[1].hook).toBeNull();

    const out = (await pool.query(`SELECT output, status FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.status).toBe('completed');
    expect(out.output.researched).toBe(2);
    expect(out.output.with_recommendation).toBe(1);
  });

  it('records an unreadable site as a gap, never as a guessed brief', async () => {
    siteText = { 'https://beta.com': siteBody('bulk drugs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1, 2] }, runId);

    const rows = await briefs();
    const alpha = rows.find((r: any) => Number(r.prospect_id) === 1)!;
    expect(alpha.status).toBe('unreadable');
    expect(alpha.error).toMatch(/alpha\.com/);
    expect(alpha.what_they_make).toBeNull();     // nothing invented
    expect(alpha.recommended_offer).toBeNull();

    // One dead site does not kill the batch.
    const beta = rows.find((r: any) => Number(r.prospect_id) === 2)!;
    expect(beta.status).toBe('drafted');
  });

  it('drops a claim no page supports, and says so in the step log', async () => {
    siteText = { 'https://alpha.com': siteBody('active pharmaceutical ingredients') };
    llmQueue.push({
      what_they_make: 'APIs',
      evidence: [
        { claim: 'two units', url: 'https://alpha.com', excerpt: 'two units in Medak district' },
        { claim: 'USFDA approved', url: 'https://alpha.com', excerpt: 'our plant is approved by the USFDA' },
      ],
    });
    llmQueue.push({ scores: [], recommended_offer: null, reason: 'thin' });

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const rows = await briefs();
    const evidence = rows[0].raw_evidence as { claim: string }[];
    expect(evidence.map((e) => e.claim)).toEqual(['two units']);

    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    const extract = steps.find((s: any) => s.step_name === 'extract');
    expect(extract.output_summary).toMatch(/1 dropped as unsupported/);
    expect(extract.status).toBe('error');
  });

  it('discards an offer id that is not in the catalogue', async () => {
    siteText = { 'https://alpha.com': siteBody('active pharmaceutical ingredients') };
    llmQueue.push({ what_they_make: 'APIs', evidence: [] });
    llmQueue.push({ scores: [], recommended_offer: 'something-we-never-sold', reason: 'invented' });

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const rows = await briefs();
    expect(rows[0].recommended_offer).toBeNull();
    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    expect(steps.some((s: any) => s.step_name === 'fit_score' && s.status === 'error')).toBe(true);
  });

  it('re-researching replaces the brief and clears a stale human decision', async () => {
    siteText = { 'https://alpha.com': siteBody('active pharmaceutical ingredients') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    let runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    await pool.query(
      `UPDATE gt_account_briefs SET status='approved', decided_by=$1, decided_at=now(),
              decision_note='looks good' WHERE prospect_id = 1`, [A]);

    queueHealthyAccount('two units in Medak district', null);
    runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const rows = await briefs();
    expect(rows).toHaveLength(1);                 // replaced, not duplicated
    expect(rows[0].status).toBe('drafted');
    expect(rows[0].decided_by).toBeNull();        // the old decision no longer applies
    expect(rows[0].decision_note).toBeNull();
  });
});

maybe('checkpoint and resume', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  it('keeps what was earned when the batch dies part-way', async () => {
    siteText = {
      'https://alpha.com': siteBody('active pharmaceutical ingredients'),
      'https://beta.com': siteBody('bulk drugs'),
    };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    // Nothing queued for Beta — its extract call throws, which is written as
    // an unreadable brief rather than losing Alpha.

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1, 2] }, runId);

    const rows = await briefs();
    expect(rows).toHaveLength(2);
    expect(rows.find((r: any) => Number(r.prospect_id) === 1)!.status).toBe('drafted');
    expect(rows.find((r: any) => Number(r.prospect_id) === 2)!.status).toBe('unreadable');

    const cp = (await pool.query(`SELECT checkpoint FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].checkpoint;
    expect(cp.done.sort()).toEqual([1, 2]);
  });

  it('a resumed run skips accounts already researched', async () => {
    siteText = { 'https://beta.com': siteBody('bulk drugs') };
    const first = await newRun();
    await pool.query(`UPDATE gt_agent_runs SET checkpoint = '{"done":[1]}'::jsonb, status='failed' WHERE id = $1`, [first]);

    queueHealthyAccount('two units in Medak district', null);
    const runId = await newRun();
    await AccountResearchAgent.run(pool, A,
      { prospect_ids: [1, 2], resume_run_id: first }, runId);

    // Alpha was never fetched — it was already done.
    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(false);
    expect((await briefs()).map((r: any) => Number(r.prospect_id))).toEqual([2]);

    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    expect(steps.some((s: any) => s.step_name === 'restore')).toBe(true);
  });
});

// CLAUDE.md rule 7, check 3.
maybe('tenant isolation', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  it('never researches another tenant\'s prospects, even on a shared tag', async () => {
    siteText = { 'https://theirs.com': siteBody('their products') };
    const runId = await newRun(A);
    await AccountResearchAgent.run(pool, A, { prospect_ids: [9] }, runId);

    expect(fetched).toHaveLength(0);              // id 9 belongs to tenant B
    expect(await briefs(A)).toHaveLength(0);
    expect(await briefs(B)).toHaveLength(0);
  });

  it('returns cleanly when the cohort is empty', async () => {
    // Tenant A, whose offers ARE complete, against a tag nothing carries.
    const runId = await newRun(A);
    await AccountResearchAgent.run(pool, A, { tag_id: 999 }, runId);
    const out = (await pool.query(`SELECT status, output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.status).toBe('completed');
    expect(out.output.researched).toBe(0);
  });
});
