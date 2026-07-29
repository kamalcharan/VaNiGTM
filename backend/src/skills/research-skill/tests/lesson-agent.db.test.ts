/**
 * The Learning Graph, against a real PostgreSQL with the LLM stubbed.
 *
 * What is being tested is the agent's CONTRACT, not the model's inference:
 *   - a rule citing companies nobody decided on is thrown away
 *   - a rule the reviewer already accepted OR rejected is not re-proposed
 *   - nothing it proposes is usable until a human accepts it
 *   - below the floor it refuses and says so, rather than inventing a policy
 *     out of four companies
 *
 * Skips without a database.
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

import { FitLessonAgent, MIN_DECISIONS } from '../lesson.agent';
import { readLessons, lessonsForPrompt, lessonKey } from '../lessons';
import { createTenantDb } from '../../../db';

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255), website VARCHAR(500),
  industry_raw TEXT, completeness NUMERIC(4,3));
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
  await admin.query('DROP DATABASE IF EXISTS fit_lesson_test');
  await admin.query('CREATE DATABASE fit_lesson_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'fit_lesson_test' });

  await pool.query(BASE);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '212_offer_commitment.sql',
                   '213_brief_human_offer.sql', '214_gt_fit_lessons.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }

  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
  await pool.query(
    `INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem,
                            price_band, proof, commitment)
     VALUES ($1,'cdo-as-a-service','CDO as a Service','A fractional CDO.',
             'Mid-size pharma.','Data is trapped.','INR 3-6 lakh','Two clients.','retainer'),
            ($1,'digital-systems-audit','Digital Systems Audit','A two-week read.',
             'Manufacturers.','Nobody can say what is where.','INR 4 lakh','Two clients.','entry')`,
    [A]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  llmQueue = [];
  await pool.query('DELETE FROM gt_fit_lessons');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_prospects');
});

async function newRun(tenantId = A): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO gt_agent_runs (tenant_id, agent_name, status)
     VALUES ($1,'FIT_LESSONS_REQUESTED','running') RETURNING id::text`, [tenantId]);
  return r.rows[0].id;
}

/** N decided briefs, named Co 1..N, so there is a history to learn from. */
async function decided(n: number, tenantId = A): Promise<string[]> {
  const names: string[] = [];
  for (let i = 1; i <= n; i++) {
    const name = `Co ${i}`;
    names.push(name);
    const p = await pool.query<{ id: number }>(
      `INSERT INTO gt_prospects (tenant_id,is_live,name,domain_normalized)
       VALUES ($1,false,$2,$3) RETURNING id`, [tenantId, name, `co${i}.com`]);
    await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id,is_live,prospect_id,domain,status,what_they_make,scale_signals,
          recommended_offer,decision_note,decided_at,fetched_at,facts_at)
       VALUES ($1,false,$2,$3,'no_contact','APIs','One plant, no exports',
               'cdo-as-a-service','single unit, no exports — too small',now(),now(),now())`,
      [tenantId, p.rows[0].id, `co${i}.com`]);
  }
  return names;
}

const runOutput = async (runId: string) =>
  (await pool.query(`SELECT output, steps FROM gt_agent_runs WHERE id = $1`, [runId])).rows[0];

const lessonRows = async (tenantId = A) => (await pool.query(
  `SELECT * FROM gt_fit_lessons WHERE tenant_id = $1 ORDER BY id`, [tenantId])).rows;

const maybe = available ? describe : describe.skip;

maybe('the floor', () => {
  it('refuses to generalise from too few decisions, and says so', async () => {
    await decided(MIN_DECISIONS - 1);
    const runId = await newRun();
    await FitLessonAgent.run(pool, A, {}, runId);

    // THE assertion: no LLM call at all — the stub would have thrown.
    const { output } = await runOutput(runId);
    expect(output.proposed).toBe(0);
    expect(output.message).toMatch(/description of a handful of companies/);
    expect(await lessonRows()).toHaveLength(0);
  });
});

maybe('proposing', () => {
  it('writes proposals that nothing can act on until a human accepts', async () => {
    const names = await decided(MIN_DECISIONS);
    llmQueue = [{
      lessons: [{
        lesson: 'Score the retainer below 0.3 for single-plant companies with no exports',
        kind: 'sizing',
        applies_to: 'cdo-as-a-service',
        from_companies: [names[0], names[1]],
      }],
    }];

    const runId = await newRun();
    await FitLessonAgent.run(pool, A, {}, runId);

    const rows = await lessonRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('proposed');
    expect(rows[0].kind).toBe('sizing');
    expect(rows[0].applies_to).toBe('cdo-as-a-service');
    // Evidence is not decoration — a rule nobody can trace cannot be checked.
    expect(rows[0].evidence).toHaveLength(2);
    expect(rows[0].evidence[0].note).toMatch(/too small/);

    // THE assertion: unratified, it reaches no prompt.
    const db = createTenantDb(pool, A);
    expect(await readLessons(db, A, false)).toHaveLength(0);
    expect(lessonsForPrompt(await readLessons(db, A, false))).toBe('');
  });

  // The same gate the account agent applies to evidence excerpts. A rule
  // inferred from companies nobody decided on was inferred from nothing.
  it('throws away a rule citing companies nobody decided on', async () => {
    await decided(MIN_DECISIONS);
    llmQueue = [{
      lessons: [
        { lesson: 'Reject anyone at all in the state of Telangana always',
          kind: 'disqualifier', from_companies: ['A Company We Never Saw'] },
        { lesson: 'Score the retainer below 0.3 for single-plant companies',
          kind: 'sizing', from_companies: ['Co 1', 'Co 2'] },
      ],
    }];

    const runId = await newRun();
    await FitLessonAgent.run(pool, A, {}, runId);

    const rows = await lessonRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].lesson).toMatch(/single-plant/);

    const { output, steps } = await runOutput(runId);
    expect(output.dropped_unevidenced).toBe(1);
    // Visible in the feed, not silently discarded.
    expect(steps.some((s: any) => s.step_name === 'propose_lessons'
      && /cited companies you never decided on/.test(s.output_summary))).toBe(true);
  });

  it('drops a rule with no evidence at all', async () => {
    await decided(MIN_DECISIONS);
    llmQueue = [{ lessons: [{ lesson: 'Be considerably more selective in general', kind: 'preference' }] }];
    await FitLessonAgent.run(pool, A, {}, await newRun());
    expect(await lessonRows()).toHaveLength(0);
  });

  it('does not re-propose something already accepted OR rejected', async () => {
    await decided(MIN_DECISIONS);
    const text = 'Score the retainer below 0.3 for single-plant companies';
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,$2,'sizing',$3,'rejected')`, [A, text, lessonKey(text)]);

    llmQueue = [{
      lessons: [{ lesson: text, kind: 'sizing', from_companies: ['Co 1', 'Co 2'] }],
    }];
    const runId = await newRun();
    await FitLessonAgent.run(pool, A, {}, runId);

    const rows = await lessonRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('rejected');    // untouched
    expect((await runOutput(runId)).output.proposed).toBe(0);
  });

  // Wording that differs only in punctuation is the same rule; treating it as
  // new is how a review queue becomes unreadable.
  it('treats a reworded duplicate as the same rule', async () => {
    await decided(MIN_DECISIONS);
    const text = 'Score the retainer below 0.3 for single-plant companies';
    await pool.query(
      `INSERT INTO gt_fit_lessons (tenant_id,is_live,lesson,kind,lesson_key,status)
       VALUES ($1,false,$2,'sizing',$3,'accepted')`, [A, text, lessonKey(text)]);

    llmQueue = [{
      lessons: [{ lesson: '  Score the retainer below 0.3, for single-plant companies!  ',
                  kind: 'sizing', from_companies: ['Co 1'] }],
    }];
    await FitLessonAgent.run(pool, A, {}, await newRun());
    expect(await lessonRows()).toHaveLength(1);
  });

  it('says plainly when it has nothing new to say', async () => {
    await decided(MIN_DECISIONS);
    llmQueue = [{ lessons: [] }];
    const runId = await newRun();
    await FitLessonAgent.run(pool, A, {}, runId);
    expect((await runOutput(runId)).output.message).toMatch(/Nothing new to propose/);
  });
});

maybe('tenant isolation', () => {
  it('never reads another tenant\'s decisions', async () => {
    await decided(MIN_DECISIONS, B);    // all the history belongs to B
    const runId = await newRun(A);
    await FitLessonAgent.run(pool, A, {}, runId);

    // A has no decisions, so it stops at the floor — no LLM call, no rows.
    const { output } = await runOutput(runId);
    expect(output.decisions).toBe(0);
    expect(await lessonRows(A)).toHaveLength(0);
  });
});
