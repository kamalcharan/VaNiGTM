/**
 * The touch log and the pilot verdict.
 *
 * This is the only code in the pilot whose OUTPUT is the conclusion. Every
 * test here exists because getting it wrong would not produce an error — it
 * would produce a confident, wrong answer to "did research-first work", and
 * that answer decides whether six agents get built.
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

import { log_touch } from '../functions/log-touch';
import { set_touch_outcome } from '../functions/set-touch-outcome';
import { get_touches } from '../functions/get-touches';
import { pilot_result } from '../functions/pilot-result';
import { RESPONSE_WINDOW_DAYS, MIN_CONCLUDED_FOR_VERDICT, verdictFor } from '../touches';
import { createTenantDb } from '../../../db';

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), industry_raw TEXT, completeness NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_contacts (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, full_name VARCHAR(200),
  prospect_id BIGINT REFERENCES gt_prospects(id) ON DELETE SET NULL);
CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS touch_log_test');
  await admin.query('CREATE DATABASE touch_log_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'touch_log_test' });

  await pool.query(BASE);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '213_brief_human_offer.sql',
                   '221_gt_touch_log.sql', '222_gt_journeys.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }

  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('DELETE FROM gt_touch_log');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_prospects');
});

const ctxFor = (tenant = A) => ({
  tenant_id: tenant, is_live: false, user_id: tenant, is_admin: false,
  db: createTenantDb(pool, tenant),
}) as never;

/** A company, optionally with a brief (i.e. a researched send). */
async function company(name: string, researched: boolean, tenant = A): Promise<number> {
  const p = await pool.query<{ id: number }>(
    `INSERT INTO gt_prospects (tenant_id,is_live,ref,name,domain_normalized)
     VALUES ($1,false,$2,$3,$4) RETURNING id`,
    [tenant, name.replace(/\W/g, '').slice(0, 10), name, `${name.toLowerCase()}.com`]);
  const id = Number(p.rows[0].id);
  if (researched) {
    await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id,is_live,prospect_id,domain,status,fetched_at,facts_at,what_they_make)
       VALUES ($1,false,$2,$3,'approved',now(),now(),'APIs')`,
      [tenant, id, `${name.toLowerCase()}.com`]);
  }
  return id;
}

/** A touch aged into the past, so the response window can be exercised. */
async function touch(
  prospectId: number, daysAgo: number, outcome: string | null, hadBrief = true, tenant = A,
) {
  const r = await pool.query<{ id: number }>(
    `INSERT INTO gt_touch_log
       (tenant_id,is_live,prospect_id,channel,touched_at,outcome,outcome_at,had_brief)
     VALUES ($1,false,$2,'email', now() - ($3 || ' days')::interval, $4::text,
             CASE WHEN $4::text IS NULL THEN NULL ELSE now() END, $5)
     RETURNING id`,
    [tenant, prospectId, String(daysAgo), outcome, hadBrief]);
  return Number(r.rows[0].id);
}

const maybe = available ? describe : describe.skip;

/* ── The criteria, in isolation ─────────────────────────────────────── */

describe('verdictFor — the pre-registered criteria', () => {
  const N = MIN_CONCLUDED_FOR_VERDICT;

  it('matches the plan at every boundary', () => {
    expect(verdictFor(0.08, N)).toBe('validated');
    expect(verdictFor(0.0799, N)).toBe('needs_work');
    expect(verdictFor(0.03, N)).toBe('needs_work');
    expect(verdictFor(0.0299, N)).toBe('do_not_build');
    expect(verdictFor(0, N)).toBe('do_not_build');
  });

  // At fifteen concluded sends one reply moves the rate seven points and can
  // cross a boundary on its own.
  it('withholds a verdict below the floor, however good the rate looks', () => {
    expect(verdictFor(1.0, N - 1)).toBe('too_early');
    expect(verdictFor(0, N - 1)).toBe('too_early');
  });
});

/* ── Logging ────────────────────────────────────────────────────────── */

maybe('log_touch', () => {
  // The criteria are about RESEARCHED sends. Deriving that at read time would
  // move the denominator whenever a brief is deleted — which has already
  // happened twice in this pilot.
  it('freezes whether the send was researched', async () => {
    const id = await company('Alpha', true);
    const res = await log_touch({ prospect_id: id, channel: 'email' }, ctxFor()) as
      { had_brief: boolean };
    expect(res.had_brief).toBe(true);

    await pool.query('DELETE FROM gt_account_briefs');

    const row = (await pool.query(`SELECT had_brief FROM gt_touch_log`)).rows[0];
    expect(row.had_brief).toBe(true);   // still a researched send
  });

  it('records an unresearched send as outside the denominator', async () => {
    const id = await company('Beta', false);
    const res = await log_touch({ prospect_id: id, channel: 'phone' }, ctxFor()) as
      { had_brief: boolean; message: string };
    expect(res.had_brief).toBe(false);
    expect(res.message).toMatch(/OUTSIDE the researched denominator/);
  });

  it('refuses a channel it does not know', async () => {
    const id = await company('Gamma', true);
    await expect(log_touch({ prospect_id: id, channel: 'carrier pigeon' }, ctxFor()))
      .rejects.toThrow(/channel must be one of/);
  });

  it('never logs against another tenant\'s company', async () => {
    const theirs = await company('Theirs', true, B);
    await expect(log_touch({ prospect_id: theirs, channel: 'email' }, ctxFor(A)))
      .rejects.toThrow(/No such company/);
  });
});

maybe('set_touch_outcome', () => {
  it('records what came back, with a date', async () => {
    const id = await company('Alpha', true);
    const t = await log_touch({ prospect_id: id, channel: 'email' }, ctxFor()) as
      { touch_id: number };
    await set_touch_outcome({ touch_id: t.touch_id, outcome: 'replied' }, ctxFor());

    const row = (await pool.query(`SELECT outcome, outcome_at FROM gt_touch_log`)).rows[0];
    expect(row.outcome).toBe('replied');
    expect(row.outcome_at).not.toBeNull();
  });

  it('clears a mis-clicked outcome, date and all', async () => {
    const id = await company('Alpha', true);
    const t = await log_touch({ prospect_id: id, channel: 'email' }, ctxFor()) as
      { touch_id: number };
    await set_touch_outcome({ touch_id: t.touch_id, outcome: 'meeting' }, ctxFor());
    await set_touch_outcome({ touch_id: t.touch_id, outcome: null }, ctxFor());

    const row = (await pool.query(`SELECT outcome, outcome_at FROM gt_touch_log`)).rows[0];
    expect(row.outcome).toBeNull();
    expect(row.outcome_at).toBeNull();
  });

  it('refuses an outcome it does not know', async () => {
    const id = await company('Alpha', true);
    const t = await log_touch({ prospect_id: id, channel: 'email' }, ctxFor()) as
      { touch_id: number };
    await expect(set_touch_outcome({ touch_id: t.touch_id, outcome: 'maybe' }, ctxFor()))
      .rejects.toThrow(/outcome must be one of/);
  });
});

/* ── The verdict, against real rows ─────────────────────────────────── */

maybe('pilot_result', () => {
  /** n researched sends, `replies` of them answered, all past the window. */
  async function concludedSends(n: number, replies: number) {
    for (let i = 0; i < n; i++) {
      const id = await company(`Co${i}`, true);
      await touch(id, RESPONSE_WINDOW_DAYS + 1, i < replies ? 'replied' : null);
    }
  }

  // Rule 1: a send inside the window with no answer is NEITHER. Counting it
  // as a non-reply depresses the rate early; dropping it from the denominator
  // inflates it. Both are wrong.
  it('excludes pending sends from the rate entirely', async () => {
    await concludedSends(10, 1);
    const fresh = await company('Fresh', true);
    await touch(fresh, 1, null);          // sent yesterday, no answer yet

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.sends).toBe(11);
    expect(r.researched.concluded).toBe(10);
    expect(r.researched.pending).toBe(1);
    expect(r.researched.reply_rate).toBeCloseTo(0.1, 5);
  });

  // Rule 2: otherwise the rate measures only the touches somebody remembered
  // to close.
  it('counts silence past the window as an answer', async () => {
    const id = await company('Silent', true);
    await touch(id, RESPONSE_WINDOW_DAYS + 1, null);

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.concluded).toBe(1);
    expect(r.researched.pending).toBe(0);
    expect(r.researched.reply_rate).toBe(0);
  });

  it('says "no reading" rather than 0% when nothing has concluded', async () => {
    const id = await company('Fresh', true);
    await touch(id, 1, null);

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.reply_rate).toBeNull();
    expect(r.verdict).toBe('too_early');
  });

  // An explicit no IS engagement. Counting it as silence would flatter the
  // channel and hide an offer problem.
  it('counts not_interested as a reply', async () => {
    const id = await company('No', true);
    await touch(id, RESPONSE_WINDOW_DAYS + 1, 'not_interested');

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.replies).toBe(1);
  });

  // It never reached them. Reachability is the least-tested assumption in the
  // plan, so it is counted on its own rather than as a rejection.
  it('does not count a bounce as a reply', async () => {
    const id = await company('Bounced', true);
    await touch(id, RESPONSE_WINDOW_DAYS + 1, 'bounced');

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.replies).toBe(0);
    expect(r.researched.bounced).toBe(1);
    expect(r.researched.concluded).toBe(1);
  });

  it('reaches the pre-registered verdicts on real rows', async () => {
    await concludedSends(25, 3);                 // 12%
    let r = await pilot_result({}, ctxFor()) as any;
    expect(r.verdict).toBe('validated');

    await pool.query('DELETE FROM gt_touch_log');
    await pool.query('DELETE FROM gt_account_briefs');
    await pool.query('DELETE FROM gt_prospects');
    await concludedSends(25, 1);                 // 4%
    r = await pilot_result({}, ctxFor()) as any;
    expect(r.verdict).toBe('needs_work');

    await pool.query('DELETE FROM gt_touch_log');
    await pool.query('DELETE FROM gt_account_briefs');
    await pool.query('DELETE FROM gt_prospects');
    await concludedSends(40, 0);                 // 0%
    r = await pilot_result({}, ctxFor()) as any;
    expect(r.verdict).toBe('do_not_build');
    expect(r.verdict_text).toMatch(/do not build agents/);
  });

  it('keeps researched and unresearched sends apart', async () => {
    const a = await company('Researched', true);
    await touch(a, RESPONSE_WINDOW_DAYS + 1, 'replied', true);
    const b = await company('Cold', false);
    await touch(b, RESPONSE_WINDOW_DAYS + 1, null, false);

    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.researched.sends).toBe(1);
    expect(r.unresearched.sends).toBe(1);
    expect(r.comparison.difference).toBeCloseTo(1, 5);
  });

  // No query can answer the second gate, and a screen showing only the rate
  // would let the pilot pass on half its criteria.
  it('always returns the qualitative gate as an open question', async () => {
    const r = await pilot_result({}, ctxFor()) as any;
    expect(r.qualitative_gate).toMatch(/what a template would have said/);
  });

  it('never counts another tenant\'s sends', async () => {
    const theirs = await company('Theirs', true, B);
    await touch(theirs, RESPONSE_WINDOW_DAYS + 1, 'replied', true, B);

    const r = await pilot_result({}, ctxFor(A)) as any;
    expect(r.researched.sends).toBe(0);
  });
});

maybe('get_touches', () => {
  it('flags what is still inside the window', async () => {
    const id = await company('Alpha', true);
    await touch(id, 1, null);
    await touch(id, RESPONSE_WINDOW_DAYS + 1, null);

    const r = await get_touches({ prospect_id: id }, ctxFor()) as any;
    expect(r.touches).toHaveLength(2);
    expect(r.touches.filter((t: any) => t.is_pending)).toHaveLength(1);
  });

  it('never returns another tenant\'s touches', async () => {
    const theirs = await company('Theirs', true, B);
    await touch(theirs, 1, null, true, B);
    const r = await get_touches({}, ctxFor(A)) as any;
    expect(r.touches).toHaveLength(0);
  });
});
