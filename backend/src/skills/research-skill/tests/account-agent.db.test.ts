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

// SearXNG: off by default, so every existing test still describes a
// website-only run. A test that cares about the second source turns it on.
let searchHits: { title: string; url: string; snippet: string }[] = [];
let searchOn = false;
let searchThrows: string | null = null;
jest.mock('../../../agent-core/search.client', () => ({
  searchConfigured: jest.fn(() => searchOn),
  searchWeb: jest.fn(async () => {
    if (searchThrows) throw new Error(searchThrows);
    return searchHits;
  }),
}));

let llmQueue: unknown[] = [];
// Unmetered by default so existing tests are unaffected; a test that cares
// about the budget sets `budget` and the agent sees a real limit.
// No cap by default — which is what a real tenant looks like since migration
// 217. A test that cares about a cap sets one.
let budget: {
  limit: number | null; used: number; remaining: number;
  capped: boolean; tracked: boolean;
} = { limit: null, used: 0, remaining: Number.POSITIVE_INFINITY, capped: false, tracked: true };
jest.mock('../../../agent-core/llm.client', () => ({
  callLLMValidated: jest.fn(async () => {
    // Tokens are SPENT by calls. A static stub would let the agent read the
    // same remaining budget forever and never stop — hiding the exact bug
    // these tests exist for.
    if (budget.capped) {
      budget.used += SPEND_PER_CALL;
      budget.remaining = Math.max(0, budget.remaining - SPEND_PER_CALL);
    }
    if (llmQueue.length === 0) throw new Error('stub LLM: nothing queued');
    return llmQueue.shift();
  }),
  getTokenBudget: jest.fn(async () => ({ ...budget })),
}));

/** Three calls per full company (extract, fit, hook) ≈ COST_FULL_RESEARCH. */
const SPEND_PER_CALL = 4_700;

import {
  AccountResearchAgent, COST_FULL_RESEARCH, COST_RESCORE_ONLY,
} from '../account.agent';
import { get_briefs } from '../functions/get-briefs';
import { createTenantDb } from '../../../db';

/* ── Schema ────────────────────────────────────────────────────────────── */

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_tags (id BIGSERIAL PRIMARY KEY, tenant_id UUID, label VARCHAR(80),
  is_active BOOLEAN DEFAULT true);
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL,
  domain_normalized VARCHAR(255), website VARCHAR(500),
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
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
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
  // The real migrations, so the shipped constraints are what is tested —
  // including 210, which is what makes 'extract_failed' a legal status.
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '212_offer_commitment.sql',
                   '213_brief_human_offer.sql', '214_gt_fit_lessons.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }

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

beforeEach(() => {
  fetched.length = 0; llmQueue = []; siteText = {};
  searchHits = []; searchOn = false; searchThrows = null;
  budget = { limit: null, used: 0, remaining: Number.POSITIVE_INFINITY,
             capped: false, tracked: true };
});

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

    // refresh: a company with a brief is skipped by default now, so redoing
    // one has to be asked for.
    queueHealthyAccount('two units in Medak district', null);
    runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, runId);

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

maybe('not researching the same company twice', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  it('skips a company that already has a brief', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs'), 'https://beta.com': siteBody('bulk drugs') };

    // First run does Alpha only.
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);

    // Second run over BOTH must not touch Alpha again.
    fetched.length = 0;
    queueHealthyAccount('two units in Medak district', null);
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1, 2] }, await newRun());

    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(false);
    expect(fetched.some((u) => u.includes('beta.com'))).toBe(true);
    expect((await briefs()).map((r: any) => Number(r.prospect_id))).toEqual([1, 2]);
  });

  it('redoes it when refresh is asked for', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    fetched.length = 0;
    queueHealthyAccount('two units in Medak district', null);
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, await newRun());

    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);
    const rows = await briefs();
    expect(rows).toHaveLength(1);                       // replaced, not duplicated
    expect(rows[0].recommended_offer).toBeNull();       // the newer verdict
  });

  it('completes cleanly, saying so, when everything is already done', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    fetched.length = 0;
    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    expect(fetched).toHaveLength(0);
    const out = (await pool.query(`SELECT status, output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.status).toBe('completed');
    expect(out.output.researched).toBe(0);
    expect(out.output.message).toMatch(/already has a brief/i);
  });

  it('says in the step log which mode it ran in', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', null);
    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    const cohort = steps.find((x: any) => x.step_name === 'cohort');
    expect(cohort.action).toMatch(/skipping any already researched/i);
  });
});

maybe('a failed brief is not a researched company', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  // The bug this covers: "4 already researched" was counting rows that
  // FAILED — including one our own pipeline broke. Both would have been
  // written off forever.
  it('retries a company our own extraction failed on, without being asked', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    await pool.query(
      `INSERT INTO gt_account_briefs (tenant_id, is_live, prospect_id, status, error, domain)
       VALUES ($1, false, 1, 'extract_failed', 'LLM_VALIDATION_FAILED: truncated', 'alpha.com')`,
      [A]);

    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);
    const rows = await briefs();
    expect(rows[0].status).toBe('drafted');       // recovered on its own
  });

  it('leaves a dead website alone unless refresh is asked for', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    await pool.query(
      `INSERT INTO gt_account_briefs (tenant_id, is_live, prospect_id, status, error, domain)
       VALUES ($1, false, 1, 'unreadable', 'No address answered', 'alpha.com')`,
      [A]);

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched).toHaveLength(0);              // a finding about them, not a bug

    queueHealthyAccount('two units in Medak district', null);
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, await newRun());
    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);
  });

  it('never re-crawls a real brief, whatever else it needs', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    // No fingerprint: judged against an unknown offer set, so it is stale
    // and will be RE-SCORED — but it already has facts, so it must not be
    // crawled again. That distinction is the whole point of the split.
    await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id, is_live, prospect_id, status, domain, what_they_make, facts_at)
       VALUES ($1, false, 1, 'drafted', 'alpha.com', 'APIs', now())`, [A]);

    llmQueue = [{ scores: [], recommended_offer: null, reason: 'rescored' }];
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched).toHaveLength(0);
  });
});

maybe('facts and judgement are separate halves', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  /** Editing an offer is what makes every existing judgement stale. */
  const touchOffer = () => pool.query(
    `UPDATE gt_offers SET updated_at = now() + interval '1 second'
      WHERE tenant_id = $1 AND offer_key = 'cdo-as-a-service'`, [A]);

  it('re-scores against new offers WITHOUT crawling again', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);

    // The offer wording moves. Judgement is stale; facts are not.
    await touchOffer();
    fetched.length = 0;
    llmQueue = [{ scores: [], recommended_offer: null, reason: 'no longer a fit' }];

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    // THE assertion: no network at all, and only ONE call was needed.
    expect(fetched).toHaveLength(0);
    expect(llmQueue).toHaveLength(0);

    const out = (await pool.query(`SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.output.rescored_without_crawling).toBe(1);

    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    expect(steps.some((x: any) => x.step_name === 'reuse_facts')).toBe(true);
  });

  it('leaves the facts untouched when only re-scoring', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const before = (await briefs())[0];
    await touchOffer();
    llmQueue = [{ scores: [], recommended_offer: null, reason: 'changed my mind' }];
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const after = (await briefs())[0];
    // The expensive half survives exactly.
    expect(after.what_they_make).toBe(before.what_they_make);
    expect(after.scale_signals).toBe(before.scale_signals);
    expect(after.raw_evidence).toEqual(before.raw_evidence);
    expect(after.pages_read).toBe(before.pages_read);
    expect(after.facts_at.toISOString()).toBe(before.facts_at.toISOString());
    // The cheap half moved.
    expect(after.recommended_offer).toBeNull();
    expect(after.judged_at.getTime()).toBeGreaterThan(before.judged_at.getTime());
  });

  it('does nothing at all when the offers have not moved', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    fetched.length = 0;
    llmQueue = [];
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched).toHaveLength(0);   // and no LLM call, or the stub would throw
  });

  it('stores the certifications it extracts, which were being thrown away', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect((await briefs())[0].certifications).toEqual(['WHO-GMP']);
  });

  it('refresh still redoes both halves', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    fetched.length = 0;
    queueHealthyAccount('two units in Medak district', null);
    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, runId);

    expect(fetched.some((u) => u.includes('alpha.com'))).toBe(true);
    const out = (await pool.query(`SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.output.rescored_without_crawling).toBe(0);
  });
});

/* ── The ladder (migration 212) ─────────────────────────────────────── */

maybe('what fits best vs what to open with', () => {
  // A second offer on the entry rung, so the two axes can come apart at all.
  // Added and removed here rather than in the fixture: every other test in
  // this file counts LLM calls, and a second offer changes nothing about them
  // but a third row in the prompt is noise those tests do not need.
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem,
                              what_we_do, signals, disqualifiers, price_band, proof,
                              commitment)
       VALUES ($1,'digital-systems-audit','Digital Systems Audit',
               'A two-week read of what your plant systems actually hold.',
               'Manufacturers who suspect their data is a mess and want it named.',
               'Nobody can say what is in which system, so every decision is re-litigated.',
               ARRAY['A written map of every system and what it is trusted for'],
               ARRAY['ERP named on the site with no analytics layer visible'],
               ARRAY['Fewer than about fifty staff'],
               'INR 4-6 lakh, fixed',
               'Run for two Hyderabad manufacturers in 2025.',
               'entry')`, [A]);
  });
  afterAll(async () => {
    await pool.query(`DELETE FROM gt_offers WHERE tenant_id = $1 AND offer_key = 'digital-systems-audit'`, [A]);
  });
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  /** Facts, then a fit verdict with whatever scores the test wants. */
  const queueWith = (scores: { offer_id: string; score: number }[], rec: string | null) => {
    llmQueue.push({
      what_they_make: 'Active pharmaceutical ingredients',
      scale_signals: 'Two units in Medak',
      certifications: ['WHO-GMP'],
      evidence: [{ claim: 'Two units in Medak', url: 'https://alpha.com', excerpt: 'two units in Medak district' }],
    });
    llmQueue.push({
      scores: scores.map((s) => ({ ...s, reason: 'because' })),
      recommended_offer: rec, reason: 'multi-site, no data lead',
    });
    if (rec) llmQueue.push({ hook: 'Two units in Medak, each with its own batch records.' });
  };

  // Biophore's real numbers from the first pilot run, in miniature: a
  // retainer beating an entry offer by 0.13 — inside the noise.
  it('opens with the smaller ask and records what actually fit best', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueWith([
      { offer_id: 'cdo-as-a-service', score: 0.81 },
      { offer_id: 'digital-systems-audit', score: 0.68 },
    ], 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const row = (await briefs())[0];
    expect(row.best_fit_offer).toBe('cdo-as-a-service');
    expect(row.recommended_offer).toBe('digital-systems-audit');
    expect(Number(row.fit_margin)).toBeCloseTo(0.13, 3);

    // Visible in the feed, not only in a column.
    const steps = (await pool.query(`SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0].steps;
    expect(steps.some((x: any) => x.step_name === 'fit_score' && /smaller first ask/.test(x.output_summary))).toBe(true);
    expect(steps.some((x: any) => x.step_name === 'fit_unclear')).toBe(true);

    const out = (await pool.query(`SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.output.smaller_first_ask).toBe(1);
  });

  it('leaves a clear winner alone and says the gap was clear', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueWith([
      { offer_id: 'cdo-as-a-service', score: 0.9 },
      { offer_id: 'digital-systems-audit', score: 0.2 },
    ], 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const row = (await briefs())[0];
    expect(row.recommended_offer).toBe('cdo-as-a-service');
    expect(row.best_fit_offer).toBe('cdo-as-a-service');
    expect(Number(row.fit_margin)).toBeCloseTo(0.7, 3);

    const out = (await pool.query(`SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.output.smaller_first_ask).toBe(0);
    expect(out.output.fit_unclear).toBe(0);
  });

  // The rule narrows an existing yes. It must never turn a no into a yes,
  // however high something scored (CLAUDE.md rule 12).
  it('never manufactures a recommendation the model did not make', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueWith([
      { offer_id: 'cdo-as-a-service', score: 0.4 },
      { offer_id: 'digital-systems-audit', score: 0.38 },
    ], null);

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const row = (await briefs())[0];
    expect(row.recommended_offer).toBeNull();
    expect(row.best_fit_offer).toBeNull();
    expect(row.hook).toBeNull();
  });

  // The hook is written about the offer we will ACTUALLY open with, and with
  // the offer's NAME — it used to be handed the raw key.
  it('writes the hook about the offer being opened with, by name', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueWith([
      { offer_id: 'cdo-as-a-service', score: 0.81 },
      { offer_id: 'digital-systems-audit', score: 0.7 },
    ], 'cdo-as-a-service');

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const { callLLMValidated } = jest.requireMock('../../../agent-core/llm.client');
    const hookCall = callLLMValidated.mock.calls.at(-1)[0];
    expect(hookCall.messages[0].content).toContain('Digital Systems Audit');
    expect(hookCall.messages[0].content).not.toContain('digital-systems-audit');
  });

  // The primacy fix, end to end. readOffers returns `ORDER BY sort_order,
  // offer_key`, which puts cdo-as-a-service first — and on the first pilot
  // run the offer rendered first won 4 of 5 companies by 0.03. So the
  // assertion is that the prompt does NOT follow catalogue order.
  //
  // Deterministic, not statistical: with a seed of '1' the hash orders the
  // audit first. Whether any two given companies differ is a property of the
  // hash and is tested over 40 seeds in offer-catalogue.test.ts; what matters
  // here is that the agent actually passes the seed through.
  it('does not render the offers in catalogue order', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueWith([{ offer_id: 'cdo-as-a-service', score: 0.8 }], 'cdo-as-a-service');

    const { callLLMValidated } = jest.requireMock('../../../agent-core/llm.client');
    callLLMValidated.mock.calls.length = 0;
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const fitPrompt = (callLLMValidated.mock.calls
      .map((c: any) => c[0].messages[0].content as string)
      .find((c: string) => c.includes('OUR OFFERS:')))!;
    const body = fitPrompt.slice(fitPrompt.indexOf('OUR OFFERS:'));

    expect(body.indexOf('id: digital-systems-audit'))
      .toBeLessThan(body.indexOf('id: cdo-as-a-service'));
  });
});

/* ── The correction loop (migrations 213-215) ───────────────────────── */

maybe('what a human ruled is remembered, not overwritten', () => {
  beforeEach(async () => {
    await pool.query('DELETE FROM gt_account_briefs');
    await pool.query('DELETE FROM gt_fit_lessons');
  });

  const researched = async (id: number, domain: string, offer: string | null) => {
    siteText = { [`https://${domain}`]: siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', offer);
    await AccountResearchAgent.run(pool, A, { prospect_ids: [id] }, await newRun());
  };

  // The defect migration 213 exists for: decide_brief overwrote the agent's
  // recommendation with the human's, destroying the disagreement — the single
  // most useful thing the pilot produces.
  it('keeps the agent\'s proposal when a human reassigns the offer', async () => {
    await researched(1, 'alpha.com', 'cdo-as-a-service');
    await pool.query(
      `UPDATE gt_account_briefs
          SET status='approved', human_offer='digital-systems-audit',
              decision_note='too early for a retainer', decided_at=now()
        WHERE tenant_id=$1`, [A]);

    const row = (await briefs())[0];
    expect(row.recommended_offer).toBe('cdo-as-a-service');   // the agent's word
    expect(row.human_offer).toBe('digital-systems-audit');    // the human's
  });

  it('shows the fit prompt what the reviewer has already decided', async () => {
    // Two rulings, so there is something to show at all.
    await researched(1, 'alpha.com', 'cdo-as-a-service');
    await pool.query(
      `UPDATE gt_account_briefs SET status='no_contact',
              decision_note='single unit, no exports — too small', decided_at=now()
        WHERE tenant_id=$1 AND prospect_id=1`, [A]);

    const { callLLMValidated } = jest.requireMock('../../../agent-core/llm.client');
    callLLMValidated.mock.calls.length = 0;
    await researched(2, 'beta.com', 'cdo-as-a-service');

    const fit = callLLMValidated.mock.calls
      .map((c: any) => c[0].messages[0].content as string)
      .find((c: string) => c.includes('OUR OFFERS:'))!;

    expect(fit).toContain('HOW THIS REVIEWER HAS ACTUALLY DECIDED');
    expect(fit).toContain('Alpha API');
    expect(fit).toContain('single unit, no exports — too small');
    // The framing that stops eight rejections reading as "reject everything".
    expect(fit).toMatch(/NOT a rule and NOT a quota/);
  });

  it('shows ratified lessons as rules, and never shows unratified ones', async () => {
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,'Score the retainer below 0.3 for single-plant companies',
               'sizing','key-accepted','accepted'),
              ($1,false,'Never approve anyone in Telangana at all',
               'disqualifier','key-proposed','proposed')`, [A]);

    const { callLLMValidated } = jest.requireMock('../../../agent-core/llm.client');
    callLLMValidated.mock.calls.length = 0;
    await researched(1, 'alpha.com', 'cdo-as-a-service');

    const fit = callLLMValidated.mock.calls
      .map((c: any) => c[0].messages[0].content as string)
      .find((c: string) => c.includes('OUR OFFERS:'))!;

    expect(fit).toContain('RULES THIS REVIEWER HAS CONFIRMED');
    expect(fit).toContain('single-plant companies');
    // THE assertion: a proposal nobody has accepted cannot influence a score.
    expect(fit).not.toContain('Never approve anyone in Telangana');
  });

  // A ruling stands until the human changes it. Re-scoring a decided brief
  // would move the offer out from under a decision that named a different one.
  it('never re-judges a brief a human has ruled on', async () => {
    await researched(1, 'alpha.com', 'cdo-as-a-service');
    await pool.query(
      `UPDATE gt_account_briefs SET status='approved',
              human_offer='digital-systems-audit', decided_at=now()
        WHERE tenant_id=$1`, [A]);

    // Ratifying a lesson stales every judgement made before it.
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,'Score the retainer below 0.3 for single-plant companies',
               'sizing','key-x','accepted')`, [A]);

    fetched.length = 0;
    llmQueue = [];
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    expect(fetched).toHaveLength(0);   // and no LLM call, or the stub throws
    const row = (await briefs())[0];
    expect(row.human_offer).toBe('digital-systems-audit');
    expect(row.status).toBe('approved');
  });

  // The other half of the same rule: an UNDECIDED brief does go stale, which
  // is what puts "N re-scoring" on the screen.
  it('re-scores an undecided brief when a lesson is ratified', async () => {
    await researched(1, 'alpha.com', 'cdo-as-a-service');
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,'Score the retainer below 0.3 for single-plant companies',
               'sizing','key-y','accepted')`, [A]);

    fetched.length = 0;
    llmQueue = [{ scores: [], recommended_offer: null, reason: 'too small under the new rule' }];
    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    expect(fetched).toHaveLength(0);          // re-scored, never re-crawled
    expect(llmQueue).toHaveLength(0);         // exactly one call
    const out = (await pool.query(`SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(out.output.rescored_without_crawling).toBe(1);
  });

  it('never reads another tenant\'s decisions', async () => {
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,'A rule belonging to somebody else entirely',
               'sizing','key-theirs','accepted')`, [B]);

    const { callLLMValidated } = jest.requireMock('../../../agent-core/llm.client');
    callLLMValidated.mock.calls.length = 0;
    await researched(1, 'alpha.com', 'cdo-as-a-service');

    const fit = callLLMValidated.mock.calls
      .map((c: any) => c[0].messages[0].content as string)
      .find((c: string) => c.includes('OUR OFFERS:'))!;
    expect(fit).not.toContain('somebody else entirely');
  });
});

/* ── The token budget (a resource, not a wall) ──────────────────────── */

maybe('running out of budget', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  // The default since migration 217, and the point of it: a tenant nobody
  // configured is not silently capped at a number sized for chat agents.
  it('does not limit a tenant nobody set a cap for', async () => {
    // budget is left at capped:false by beforeEach.
    siteText = {
      'https://alpha.com': siteBody('APIs'),
      'https://beta.com': siteBody('bulk drugs'),
    };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { tag_id: 7 }, runId);

    expect(await briefs()).toHaveLength(2);
    const { output, steps } = (await pool.query(
      `SELECT output, steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(output.stopped_for_budget).toBe(false);
    // No cap, so no budget step to read and nothing to decide against.
    expect(steps.some((x: any) => x.step_name === 'budget')).toBe(false);
    expect(output.tokens_limit).toBeNull();
  });

  const metered = (remaining: number) => {
    budget = { limit: 100_000, used: 100_000 - remaining, remaining,
               capped: true, tracked: true };
  };

  // The defect this exists for: a spent budget wrote extract_failed across
  // every remaining company, so ninety untouched companies looked like
  // ninety broken ones — and a later run would treat them as retryable
  // pipeline failures rather than work never started.
  it('crawls nothing and writes nothing when the budget is already spent', async () => {
    metered(1_000);
    siteText = { 'https://alpha.com': siteBody('APIs'), 'https://beta.com': siteBody('bulk drugs') };

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { tag_id: 7 }, runId);

    expect(fetched).toHaveLength(0);
    expect(await briefs()).toHaveLength(0);

    const { output } = (await pool.query(
      `SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(output.stopped_for_budget).toBe(true);
    expect(output.researched).toBe(0);
    // Whose limit it is, said plainly — this is not the model refusing.
    expect(output.message).toMatch(/our own cap/i);
  });

  it('does what it can afford, keeps it, and stops clean', async () => {
    // Enough for exactly one full company.
    metered(COST_FULL_RESEARCH + 100);
    siteText = { 'https://alpha.com': siteBody('APIs'), 'https://beta.com': siteBody('bulk drugs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { tag_id: 7 }, runId);

    const rows = await briefs();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('drafted');      // real, not a failure row

    const { output, steps } = (await pool.query(
      `SELECT output, steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(output.stopped_for_budget).toBe(true);
    expect(output.researched).toBe(1);
    expect(output.not_attempted).toBe(1);
    expect(steps.some((x: any) => x.step_name === 'budget_stop')).toBe(true);
  });

  // Said BEFORE the first crawl, so nobody watches a hundred companies get
  // read only to find out at company eight.
  it('says up front how many it can afford', async () => {
    metered(COST_FULL_RESEARCH * 1.5);
    siteText = { 'https://alpha.com': siteBody('APIs'), 'https://beta.com': siteBody('bulk') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { tag_id: 7 }, runId);

    const { steps } = (await pool.query(
      `SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    const b = steps.find((x: any) => x.step_name === 'budget');
    expect(b).toBeDefined();
    expect(b.output_summary).toMatch(/about 1 of 2 compan/);
  });

  // A re-score is a quarter the cost, so a budget too small to research with
  // can still be big enough to re-judge with.
  it('prices a re-score lower than a full crawl', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    await pool.query(`UPDATE gt_offers SET updated_at = now() + interval '1 second'
                       WHERE tenant_id = $1`, [A]);
    // Too little for a crawl, ample for a judgement.
    metered(COST_RESCORE_ONLY + 100);
    fetched.length = 0;
    llmQueue = [{ scores: [], recommended_offer: null, reason: 'no longer a fit' }];

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const { output } = (await pool.query(
      `SELECT output FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(output.rescored_without_crawling).toBe(1);
    expect(output.stopped_for_budget).toBe(false);
  });
});

/* ── A failure must not delete what an earlier run earned ───────────── */

maybe('failures are non-destructive', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  const researchOk = async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
  };

  // Venkateshwara Hatcheries, from the pilot: scored 0.72 for AI Automations,
  // then a re-run hit the token cap, the catch block overwrote the row, and
  // the brief became "No fit" with an empty fit map. The research was not
  // wasted, it was DELETED — by an error that had nothing to do with them.
  it('keeps the facts and the fit when a later attempt falls over', async () => {
    await researchOk();
    const before = (await briefs())[0];
    expect(before.recommended_offer).toBe('cdo-as-a-service');

    // Force a re-crawl that fails at the LLM.
    fetched.length = 0;
    llmQueue = [];   // the stub throws: 'stub LLM: nothing queued'
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, await newRun());

    const after = (await briefs())[0];
    expect(after.recommended_offer).toBe('cdo-as-a-service');
    expect(after.what_they_make).toBe(before.what_they_make);
    expect(after.fit).toEqual(before.fit);
    expect(after.raw_evidence).toEqual(before.raw_evidence);
    // Still a real brief — and the failure is recorded on it, not instead of it.
    expect(after.status).toBe('drafted');
    expect(after.error).toMatch(/nothing queued/);
  });

  it('keeps a brief when the site stops answering', async () => {
    await researchOk();
    siteText = {};   // every address now fails
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1], refresh: true }, await newRun());

    const after = (await briefs())[0];
    expect(after.what_they_make).toBe('Active pharmaceutical ingredients');
    expect(after.status).toBe('drafted');
    expect(after.error).toMatch(/No address answered/);
  });

  // A company that never got anywhere still becomes a failure row — that is
  // the honest state, and it is what makes extract_failed retryable.
  it('still records a first attempt that never got anywhere', async () => {
    siteText = {};
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const row = (await briefs())[0];
    expect(row.status).toBe('unreadable');
    expect(row.facts_at).toBeNull();
  });
});

/* ── A site that reads fine and says nothing ────────────────────────── */

maybe('a site that says nothing', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  /**
   * What the extraction stage yields for a content-free site, AFTER the
   * schema has read the model's "not stated" idiom (that coercion is tested
   * against the real schema in account-agent.test.ts — the LLM is stubbed
   * here, so the schema never runs and asserting on it would only be testing
   * the stub).
   */
  const queueNothingFound = () => {
    llmQueue.push({
      what_they_make: 'not stated',
      scale_signals: 'not stated',
      service_signals: 'not stated',
      digital_maturity: 'not stated',
      certifications: [],
      named_contacts: [],
      evidence: [],
    });
  };

  // This used to be recorded as extract_failed — "our pipeline broke, retry
  // me" — so the same empty pages would be crawled and the same nothing
  // extracted on every future run, forever, at full cost.
  it('records a finding about them, not a failure of ours', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueNothingFound();

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const row = (await briefs())[0];
    expect(row.status).toBe('unreadable');
    expect(row.error).toMatch(/found nothing to say about them/);
    expect(row.facts_at).toBeNull();
  });

  // A finding about them, so it is not retried on its own — the same posture
  // as a dead domain.
  it('is not retried automatically the way our own failures are', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    queueNothingFound();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    fetched.length = 0;
    llmQueue = [];
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect(fetched).toHaveLength(0);   // and no LLM call, or the stub throws
  });

  it('keeps a brief when SOME facts came back', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    llmQueue.push({
      what_they_make: 'Active pharmaceutical ingredients',
      scale_signals: 'not stated',
      certifications: [], named_contacts: [], evidence: [],
    });
    llmQueue.push({
      scores: [{ offer_id: 'cdo-as-a-service', score: 0.4, reason: 'thin' }],
      recommended_offer: null, reason: 'not enough to go on',
    });

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    const row = (await briefs())[0];
    expect(row.status).toBe('drafted');
    expect(row.what_they_make).toBe('Active pharmaceutical ingredients');
  });
});

/* ── SearXNG as a second source ─────────────────────────────────────── */

maybe('the web as a second source', () => {
  beforeEach(async () => { await pool.query('DELETE FROM gt_account_briefs'); });

  const HIT = {
    title: 'Alpha API commissions third unit',
    url: 'https://pharmabiz.com/alpha-expansion',
    snippet: 'Alpha API has commissioned a third manufacturing unit at Medak, '
           + 'taking total capacity to 400 KL, the company said on Tuesday.',
  };

  // The reason search was added: Aurobindo Pharma refused all four addresses.
  // A server that will not talk to us is a fact about their server, not about
  // whether anything is knowable about the business.
  it('still produces a brief when the site refuses every address', async () => {
    siteText = {};                 // nothing answers
    searchOn = true;
    searchHits = [HIT];
    llmQueue.push({
      what_they_make: 'Active pharmaceutical ingredients',
      scale_signals: 'Third unit at Medak, 400 KL',
      certifications: [], named_contacts: [],
      evidence: [{ claim: 'third unit', url: HIT.url, excerpt: 'commissioned a third manufacturing unit at Medak' }],
    });
    llmQueue.push({
      scores: [{ offer_id: 'cdo-as-a-service', score: 0.7, reason: 'multi-site' }],
      recommended_offer: 'cdo-as-a-service', reason: 'three units',
    });
    llmQueue.push({ hook: 'A third unit at Medak.' });

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const row = (await briefs())[0];
    expect(row.status).toBe('drafted');
    expect(row.what_they_make).toBe('Active pharmaceutical ingredients');
    // The brief must NOT read as first-party when their site never answered.
    expect(row.site_health).toMatch(/did not answer/);
    expect(row.raw_evidence[0].source).toBe('search');
  });

  it('tags evidence by which source actually carried it', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    searchOn = true;
    searchHits = [HIT];
    llmQueue.push({
      what_they_make: 'APIs',
      scale_signals: 'Two units in Medak',
      certifications: [], named_contacts: [],
      evidence: [
        { claim: 'two units', url: 'https://alpha.com', excerpt: 'two units in Medak district' },
        { claim: 'third unit', url: HIT.url, excerpt: 'commissioned a third manufacturing unit at Medak' },
      ],
    });
    llmQueue.push({
      scores: [{ offer_id: 'cdo-as-a-service', score: 0.7, reason: 'multi-site' }],
      recommended_offer: 'cdo-as-a-service', reason: 'units',
    });
    llmQueue.push({ hook: 'Two units in Medak.' });

    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());

    const ev = (await briefs())[0].raw_evidence;
    expect(ev.find((e: any) => e.claim === 'two units').source).toBe('website');
    expect(ev.find((e: any) => e.claim === 'third unit').source).toBe('search');
  });

  // Their own pages are already read in full; a snippet of the same site would
  // be weaker evidence wearing a second source's label.
  it('does not count their own site as a search result', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    searchOn = true;
    searchHits = [{
      title: 'Alpha API', url: 'https://alpha.com/about',
      snippet: 'Alpha API is a manufacturer of active pharmaceutical ingredients based in Medak.',
    }];
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const { steps } = (await pool.query(
      `SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    const search = steps.find((x: any) => x.step_name === 'web_search');
    expect(search.output_summary).toMatch(/^0 usable/);
  });

  // A failed search must not fail the company — their own site is still the
  // primary source — but a batch where every search failed produces briefs
  // missing exactly the signals search was added to reach.
  it('records a failed search without losing the company', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    searchOn = true;
    searchThrows = 'SEARCH_FAILED: SearXNG returned 403 — the JSON API is disabled.';
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    expect((await briefs())[0].status).toBe('drafted');
    const { steps } = (await pool.query(
      `SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(steps.some((x: any) => x.step_name === 'web_search' && x.status === 'error')).toBe(true);
  });

  it('says search was never configured when both sources come up empty', async () => {
    siteText = {};
    searchOn = false;
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, await newRun());
    expect((await briefs())[0].error).toMatch(/SEARXNG_URL/);
  });

  // Not a fallback (CLAUDE.md rule 12): it runs for every company, not only
  // when something else failed.
  it('searches even when the site read perfectly well', async () => {
    siteText = { 'https://alpha.com': siteBody('APIs') };
    searchOn = true;
    searchHits = [HIT];
    queueHealthyAccount('two units in Medak district', 'cdo-as-a-service');

    const runId = await newRun();
    await AccountResearchAgent.run(pool, A, { prospect_ids: [1] }, runId);

    const { steps } = (await pool.query(
      `SELECT steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];
    expect(steps.some((x: any) => x.step_name === 'web_search' && x.status === 'ok')).toBe(true);
  });
});

/* ── The stat cards, as filters ─────────────────────────────────────── */

maybe('filtering the briefs by a stat card', () => {
  beforeAll(async () => {
    await pool.query('DELETE FROM gt_account_briefs');
    // One row per card, so each filter has something to find AND something to
    // exclude — a filter tested only against matching rows is not tested.
    await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id,is_live,prospect_id,domain,status,fetched_at,facts_at,
          recommended_offer,best_fit_offer,fit_margin,raw_evidence,decided_at)
       VALUES
         -- an offer, clear margin, evidenced, undecided
         ($1,false,1,'alpha.com','drafted',now(),now(),
          'cdo-as-a-service','cdo-as-a-service',0.400,
          '[{"claim":"x","url":"u","excerpt":"e"}]'::jsonb,NULL),
         -- laddered AND too close to call AND unevidenced
         ($1,false,2,'beta.com','drafted',now(),now(),
          'digital-systems-audit','cdo-as-a-service',0.050,'[]'::jsonb,NULL),
         -- no fit, decided
         ($1,false,3,'gamma.com','no_contact',now(),now(),
          NULL,NULL,NULL,'[{"claim":"y","url":"u","excerpt":"e"}]'::jsonb,now())`,
      [A]);
    await pool.query(
      `INSERT INTO gt_prospects (id,tenant_id,is_live,name,domain_normalized)
       VALUES (3,$1,false,'Gamma NoWeb2','gamma.com')
       ON CONFLICT (id) DO NOTHING`, [A]);
  });

  // Built per call: `pool` is assigned in beforeAll, so anything capturing it
  // at describe scope captures undefined.
  const ctxFor = (tenant = A) => ({
    tenant_id: tenant, is_live: false, user_id: tenant, is_admin: false,
    db: createTenantDb(pool, tenant),
  });

  const idsFor = async (view?: string) => {
    const r = await get_briefs(view ? { view } : {}, ctxFor() as never);
    return (r.briefs as Record<string, unknown>[])
      .map((b) => Number(b.prospect_id)).sort();
  };

  it('with_offer excludes the one with no fit', async () => {
    expect(await idsFor('with_offer')).toEqual([1, 2]);
  });

  it('no_fit finds only that one', async () => {
    expect(await idsFor('no_fit')).toEqual([3]);
  });

  it('smaller_ask finds the laddered one', async () => {
    expect(await idsFor('smaller_ask')).toEqual([2]);
  });

  it('fit_unclear finds the one inside the margin', async () => {
    expect(await idsFor('fit_unclear')).toEqual([2]);
  });

  it('unevidenced finds the one with nothing verified', async () => {
    expect(await idsFor('unevidenced')).toEqual([2]);
  });

  it('decided and undecided split the set', async () => {
    expect(await idsFor('decided')).toEqual([3]);
    expect(await idsFor('undecided')).toEqual([1, 2]);
  });

  it('no view shows everything', async () => {
    expect(await idsFor()).toEqual([1, 2, 3]);
  });

  // A filter that silently does nothing shows the unfiltered list, which
  // reads as "all 97 are too close to call".
  it('refuses a view it does not know instead of ignoring it', async () => {
    await expect(get_briefs({ view: 'nonsense' }, ctxFor() as never))
      .rejects.toThrow(/Unknown view/);
  });

  it('never reaches another tenant\'s briefs', async () => {
    const r = await get_briefs({ view: 'with_offer' }, ctxFor(B) as never);
    expect(r.briefs).toHaveLength(0);
  });
});
