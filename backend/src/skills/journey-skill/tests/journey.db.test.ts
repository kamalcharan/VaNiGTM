/**
 * The journey ledger against a real database.
 *
 * What is actually being guarded here:
 *
 *  1. A state change ALWAYS writes its event. The state column is a cache of
 *     the event tail; if the two can drift, the ledger stops being evidence
 *     and becomes a second opinion.
 *  2. A journey move commits with whatever caused it. A journey that advanced
 *     for a brief decision which then rolled back is the exact drift this
 *     table exists to prevent.
 *  3. Re-researching does not rewind a journey that has been contacted.
 *  4. Tenant isolation on every read (the 3-check pattern).
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

import { createTenantDb } from '../../../db';
import {
  ensureJourney, findJourney, moveJourney, moveByProspect, moveIfAt,
} from '../journey.service';
import { get_journey } from '../functions/get-journey';
import { list_journeys } from '../functions/list-journeys';
import { advance_journey } from '../functions/advance-journey';
import { decide_brief } from '../../research-skill/functions/decide-brief';
import { log_touch } from '../../research-skill/functions/log-touch';
import { set_touch_outcome } from '../../research-skill/functions/set-touch-outcome';

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), city VARCHAR(120), industry_raw TEXT,
  completeness NUMERIC(4,3), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_contacts (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, full_name VARCHAR(200),
  prospect_id BIGINT REFERENCES gt_prospects(id) ON DELETE SET NULL);
CREATE TABLE gt_offers (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL, is_live BOOLEAN NOT NULL DEFAULT false,
  offer_key VARCHAR(60) NOT NULL, name VARCHAR(200), is_active BOOLEAN NOT NULL DEFAULT true);
CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;
const ctxFor = (tenant: string, user = A) => ({
  tenant_id: tenant, is_live: false, user_id: user, is_admin: false,
  db: createTenantDb(pool, tenant),
});
const scope = { tenant_id: A, is_live: false };

async function newProspect(tenant = A, name = 'Acme Pharma'): Promise<number> {
  const r = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, ref, name)
     VALUES ($1, false, 'PROS-' || nextval('gt_prospects_id_seq')::text, $2) RETURNING id`,
    [tenant, name],
  );
  return Number(r.rows[0].id);
}

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS journey_test');
  await admin.query('CREATE DATABASE journey_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'journey_test' });

  await pool.query(BASE);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '213_brief_human_offer.sql',
                   '221_gt_touch_log.sql', '222_gt_journeys.sql',
                   '223_gt_cadence_governor.sql',
                   '225_gt_journey_stories.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('DELETE FROM gt_journey_events');
  await pool.query('DELETE FROM gt_journeys');
  await pool.query('DELETE FROM gt_touch_log');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_contacts');
  await pool.query('DELETE FROM gt_offers');
  await pool.query('DELETE FROM gt_prospects');
});

const d = available ? describe : describe.skip;

/* ── The ledger's core promise ────────────────────────────────────────── */

d('every state change writes its event', () => {
  it('opens the ledger when the journey is created', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);

    expect(j.state).toBe('sourced');
    const ev = await pool.query(
      'SELECT from_state, to_state, actor FROM gt_journey_events WHERE journey_id = $1', [j.id]);
    expect(ev.rows).toHaveLength(1);
    // NULL from_state marks a birth, and actor='system' because nobody
    // decided it — the row appeared because a company did.
    expect(ev.rows[0].from_state).toBeNull();
    expect(ev.rows[0].to_state).toBe('sourced');
    expect(ev.rows[0].actor).toBe('system');
  });

  it('writes one event per move, in order', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, p, 'researched', { actor: 'agent' });
    await moveByProspect(db, scope, p, 'qualified', { offer: 'ai-automations' });

    const ev = await pool.query(
      `SELECT e.from_state, e.to_state FROM gt_journey_events e
        JOIN gt_journeys j ON j.id = e.journey_id
       WHERE j.prospect_id = $1 ORDER BY e.id`, [p]);
    expect(ev.rows.map((r) => `${r.from_state ?? '-'}>${r.to_state}`))
      .toEqual(['->sourced', 'sourced>researched', 'researched>qualified']);
  });

  it('is a no-op, not an error, when already in the target state', async () => {
    // Callers react to events that can arrive twice. Throwing here would make
    // every one of them wrap this in a catch that swallows real failures too.
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, p, 'researched');
    const again = await moveByProspect(db, scope, p, 'researched');
    expect(again).toBeNull();

    const ev = await pool.query(
      `SELECT count(*)::int n FROM gt_journey_events e
        JOIN gt_journeys j ON j.id = e.journey_id WHERE j.prospect_id = $1`, [p]);
    expect(ev.rows[0].n).toBe(2);   // birth + one real move
  });

  it('creates exactly one journey per prospect even when raced', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await Promise.all([
      ensureJourney(db, scope, p), ensureJourney(db, scope, p), ensureJourney(db, scope, p),
    ]);
    const n = await pool.query('SELECT count(*)::int n FROM gt_journeys WHERE prospect_id=$1', [p]);
    expect(n.rows[0].n).toBe(1);
  });
});

d('R-J1 — reasons', () => {
  it('refuses an exit with no reason', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);
    await expect(moveJourney(db, scope, j, 'ruled_out')).rejects.toThrow(/REASON_REQUIRED/);
  });

  it('refuses a backward move with no reason', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, p, 'qualified');
    const j = (await findJourney(db, scope, p))!;
    await expect(moveJourney(db, scope, j, 'researched')).rejects.toThrow(/REASON_REQUIRED/);
  });

  it('accepts it with one, and keeps it', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);
    const moved = await moveJourney(db, scope, j, 'ruled_out',
      { reason: 'No IT spend, single plant' });
    expect(moved!.state_reason).toBe('No IT spend, single plant');
  });

  it('refuses an illegal edge outright', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);
    await moveJourney(db, scope, j, 'ruled_out', { reason: 'Not a fit' });
    const ruled = (await findJourney(db, scope, p))!;
    // ruled_out → waiting would put a rejected company straight into a send.
    await expect(moveJourney(db, scope, ruled, 'waiting', { reason: 'x' }))
      .rejects.toThrow(/ILLEGAL_JOURNEY_MOVE/);
  });
});

d('parking', () => {
  it('keeps the wake date and marks it due when it passes', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);
    await moveJourney(db, scope, j, 'parked', {
      reason: 'Budget next FY',
      wake_at: new Date(Date.now() + 86400_000).toISOString(),
    });

    const got = await get_journey({ prospect_id: p }, ctxFor(A));
    expect(got.journey.state).toBe('parked');
    expect(got.journey.is_due).toBe(false);

    await pool.query(`UPDATE gt_journeys SET wake_at = now() - interval '1 day'
                       WHERE prospect_id = $1`, [p]);
    const due = await get_journey({ prospect_id: p }, ctxFor(A));
    expect(due.journey.is_due).toBe(true);
  });

  it('clears the wake date on the way out', async () => {
    // The CHECK constraint forbids a wake date on a non-parked journey, so a
    // move that did not clear it would fail at the database rather than in
    // code — a worse error, further from the cause.
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, p);
    await moveJourney(db, scope, j, 'parked',
      { reason: 'Later', wake_at: new Date(Date.now() + 86400_000).toISOString() });
    const parked = (await findJourney(db, scope, p))!;
    const back = await moveJourney(db, scope, parked, 'qualified',
      { reason: 'They announced a new plant' });
    expect(back!.wake_at).toBeNull();
  });

  it('refuses a wake date in the past', async () => {
    const p = await newProspect();
    await expect(advance_journey(
      { prospect_id: p, to: 'parked', reason: 'Later', wake_at: '2020-01-01' },
      ctxFor(A),
    )).rejects.toThrow(/future/);
  });
});

/* ── Wiring: the journey must not go stale ────────────────────────────── */

d('the flows that already existed now move the journey', () => {
  async function briefFor(prospectId: number, tenant = A) {
    const r = await pool.query(
      `INSERT INTO gt_account_briefs
         (tenant_id, is_live, prospect_id, status, recommended_offer, facts_at)
       VALUES ($1, false, $2, 'drafted', 'ai-automations', now()) RETURNING id`,
      [tenant, prospectId],
    );
    return Number(r.rows[0].id);
  }

  it('decide_brief approving moves the journey to qualified and copies the offer', async () => {
    const p = await newProspect();
    const b = await briefFor(p);
    await pool.query(
      `INSERT INTO gt_offers (tenant_id, offer_key, name) VALUES ($1,'caio-as-a-service','CAIO')`,
      [A]);

    const res = await decide_brief(
      { brief_id: b, decision: 'approved', offer_key: 'caio-as-a-service' }, ctxFor(A));
    expect(res.journey_state).toBe('qualified');

    const j = await findJourney(createTenantDb(pool, A), scope, p);
    // COPIED, not joined — a later re-score must never change what we are
    // selling to an account already contacted (R-J5).
    expect(j!.offer).toBe('caio-as-a-service');
  });

  it('decide_brief ruling out carries the reason onto the journey', async () => {
    const p = await newProspect();
    const b = await briefFor(p);
    await decide_brief(
      { brief_id: b, decision: 'no_contact', note: 'Single plant, no IT spend' }, ctxFor(A));

    const j = await findJourney(createTenantDb(pool, A), scope, p);
    expect(j!.state).toBe('ruled_out');
    expect(j!.state_reason).toBe('Single plant, no IT spend');
  });

  it('log_touch moves it to waiting, skipping states a human skipped', async () => {
    const p = await newProspect();
    const res = await log_touch({ prospect_id: p, channel: 'email' }, ctxFor(A));
    expect(res.journey_state).toBe('waiting');
  });

  it('set_touch_outcome moves it to answered, and clearing walks it back', async () => {
    const p = await newProspect();
    const t = await log_touch({ prospect_id: p, channel: 'email' }, ctxFor(A));
    const ans = await set_touch_outcome({ touch_id: t.touch_id, outcome: 'replied' }, ctxFor(A));
    expect(ans.journey_state).toBe('answered');

    // A mis-clicked outcome must be reversible without stranding the journey.
    const undo = await set_touch_outcome({ touch_id: t.touch_id, outcome: null }, ctxFor(A));
    expect(undo.journey_state).toBe('waiting');
  });

  it('a rolled-back decision leaves the journey where it was', async () => {
    // The whole reason moveJourney takes the caller's tx.
    const p = await newProspect();
    const b = await briefFor(p);
    await expect(decide_brief(
      { brief_id: b, decision: 'approved', offer_key: 'does-not-exist' }, ctxFor(A),
    )).rejects.toThrow(/No active offer/);

    const j = await findJourney(createTenantDb(pool, A), scope, p);
    expect(j?.state ?? 'none').not.toBe('qualified');
  });
});

d('R7 — new research does not rewind a contacted journey', () => {
  it('moves a sourced journey to researched', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    const moved = await moveIfAt(db, scope, p, ['sourced'], 'researched', { actor: 'agent' });
    expect(moved!.state).toBe('researched');
  });

  it('leaves a journey that has already been emailed exactly alone', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await log_touch({ prospect_id: p, channel: 'email' }, ctxFor(A));
    const before = (await findJourney(db, scope, p))!;

    const moved = await moveIfAt(db, scope, p, ['sourced'], 'researched', { actor: 'agent' });
    expect(moved).toBeNull();

    const after = (await findJourney(db, scope, p))!;
    expect(after.state).toBe('waiting');
    // Not merely the same state — the same row, untouched.
    expect(after.entered_state_at).toEqual(before.entered_state_at);
  });
});

/* ── The 3-check pattern ──────────────────────────────────────────────── */

d('tenant isolation', () => {
  it('valid data: the board shows this tenant journeys and counts them', async () => {
    const p1 = await newProspect(A, 'Ours One');
    const p2 = await newProspect(A, 'Ours Two');
    const db = createTenantDb(pool, A);
    await ensureJourney(db, scope, p1);
    await moveByProspect(db, scope, p2, 'qualified');

    const res = await list_journeys({}, ctxFor(A));
    expect(res.journeys).toHaveLength(2);
    expect(res.counts.sourced.n).toBe(1);
    expect(res.counts.qualified.n).toBe(1);
    // Empty states are still listed — a state that vanishes at zero is one
    // nobody notices has emptied.
    expect(res.counts.parked.n).toBe(0);
    expect(res.counts.sourced.owed).toBe('Research this company');
  });

  it('empty: a tenant with nothing gets zeros, not an error', async () => {
    const res = await list_journeys({}, ctxFor(B));
    expect(res.journeys).toHaveLength(0);
    expect(res.total).toBe(0);
    expect(res.counts.sourced.n).toBe(0);
  });

  it('wrong tenant: another tenant journeys are invisible and unmovable', async () => {
    const mine = await newProspect(A, 'Mine');
    const db = createTenantDb(pool, A);
    const j = await ensureJourney(db, scope, mine);

    const theirs = await list_journeys({}, ctxFor(B));
    expect(theirs.journeys).toHaveLength(0);

    await expect(get_journey({ prospect_id: mine }, ctxFor(B))).rejects.toThrow(/No journey/);
    // tenant_id in the WHERE clause IS the authorisation — the id simply
    // matches nothing.
    await expect(advance_journey({ journey_id: j.id, to: 'qualified' }, ctxFor(B)))
      .rejects.toThrow(/No such journey/);

    const still = await findJourney(db, scope, mine);
    expect(still!.state).toBe('sourced');
  });

  it('rejects an unknown state rather than quietly listing everything', async () => {
    // A filter that silently does nothing shows the unfiltered list, which
    // reads as "every journey is in this state".
    await expect(list_journeys({ state: 'contacted' }, ctxFor(A))).rejects.toThrow(/Unknown journey state/);
  });
});

d('get_journey offers only moves the server will accept', () => {
  it('never offers a move the state machine forbids', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, p, 'researched');

    const got = await get_journey({ prospect_id: p }, ctxFor(A));
    expect(got.moves.map((m) => m.to)).not.toContain('won');
    const park = got.moves.find((m) => m.to === 'parked');
    expect(park!.reason_required).toBe(true);
    const qual = got.moves.find((m) => m.to === 'qualified');
    expect(qual!.reason_required).toBe(false);
  });

  it('finds a journey by ref, not just by id', async () => {
    const p = await newProspect();
    const db = createTenantDb(pool, A);
    await ensureJourney(db, scope, p);
    const r = await pool.query('SELECT ref FROM gt_prospects WHERE id=$1', [p]);

    const got = await get_journey({ ref: r.rows[0].ref }, ctxFor(A));
    expect(got.journey.prospect_id).toBe(p);
  });
});
