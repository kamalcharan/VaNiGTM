/**
 * The governor against a real database.
 *
 * The rule itself is covered in governor.test.ts. What is guarded here is
 * everything the rule depends on being true of storage:
 *
 *  1. Two opportunities on one person collide — that is the whole point.
 *  2. Sent touches and held reservations BOTH consume the window.
 *  3. A move is never silent (the CHECK constraint proves it).
 *  4. Saturation writes nothing.
 *  5. Tenant isolation (the 3-check pattern).
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
import { reserve_touch } from '../functions/reserve-touch';
import { cancel_reservation } from '../functions/cancel-reservation';
import { get_cadence } from '../functions/get-cadence';
import { get_policy } from '../functions/get-policy';
import { set_policy } from '../functions/set-policy';
import { log_touch } from '../../research-skill/functions/log-touch';

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), city VARCHAR(120), industry_raw TEXT, completeness NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_contacts (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, name VARCHAR(200) NOT NULL,
  job_title VARCHAR(200),
  prospect_id BIGINT REFERENCES gt_prospects(id) ON DELETE SET NULL);
CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;
const ctxFor = (tenant: string) => ({
  tenant_id: tenant, is_live: false, user_id: A, is_admin: false,
  db: createTenantDb(pool, tenant),
});

/** A Wednesday 10:00 IST, comfortably outside every quiet window. */
const WED = '2026-08-05T10:00:00+05:30';
const iso = (base: string, addDays: number) =>
  new Date(new Date(base).getTime() + addDays * 86_400_000).toISOString();

async function seedAccount(tenant = A) {
  const p = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1,false,'Sriveda') RETURNING id`,
    [tenant]);
  const prospect = Number(p.rows[0].id);
  const c = await pool.query(
    `INSERT INTO gt_contacts (tenant_id, is_live, name, job_title, prospect_id)
     VALUES ($1,false,'R. Menon','Head of Digital',$2) RETURNING id`, [tenant, prospect]);
  return { prospect, contact: Number(c.rows[0].id) };
}

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS cadence_test');
  await admin.query('CREATE DATABASE cadence_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'cadence_test' });

  await pool.query(BASE);
  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '213_brief_human_offer.sql',
                   '221_gt_touch_log.sql', '222_gt_journeys.sql',
                   '223_gt_cadence_governor.sql',
                   '225_gt_journey_stories.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('DELETE FROM gt_touch_reservations');
  await pool.query('DELETE FROM gt_journey_events');
  await pool.query('DELETE FROM gt_journeys');
  await pool.query('DELETE FROM gt_touch_log');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_contacts');
  await pool.query('DELETE FROM gt_prospects');
  // Back to the seeded default after any test that changed it.
  await pool.query(
    `UPDATE gt_cadence_policy SET max_touches=2, window_days=7,
       quiet_dows='{0,6}', quiet_from='19:00', quiet_to='09:00', timezone='Asia/Kolkata'`);
});

const d = available ? describe : describe.skip;

/* ── The reason it exists ─────────────────────────────────────────────── */

d('two opportunities, one person', () => {
  it('grants the first two and moves the third', async () => {
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);

    const a = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: WED, prospect_id: prospect }, ctx);
    expect(a.moved).toBe(false);

    const b = await reserve_touch({ contact_id: contact, channel: 'whatsapp',
      desired_at: iso(WED, 1), prospect_id: prospect }, ctx);
    expect(b.moved).toBe(false);

    // The third — a different opportunity, a different channel, same person.
    const c = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 2), prospect_id: prospect }, ctx);
    expect(c.moved).toBe(true);
    expect(c.moved_days).toBeGreaterThan(0);
    expect(c.reason).toMatch(/cadence governor/i);
    expect(c.blocked_by).toBe('cadence');
    // And it says what it collided with, so the move is auditable.
    expect(c.competing.length).toBe(2);
  });

  it('a different channel does not buy a way past the cap', async () => {
    // The mechanism: the reservation table is keyed on the CONTACT, so an
    // opportunity cannot skip the queue by being a different opportunity or
    // by picking another channel.
    const { contact } = await seedAccount();
    const ctx = ctxFor(A);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    await reserve_touch({ contact_id: contact, channel: 'phone', desired_at: iso(WED, 1) }, ctx);
    const third = await reserve_touch({ contact_id: contact, channel: 'linkedin',
      desired_at: iso(WED, 2) }, ctx);
    expect(third.moved).toBe(true);
  });

  it('two people at one company each get their own allowance', async () => {
    // Fatigue is a person's. Capping the company would be a different rule.
    const { prospect, contact } = await seedAccount();
    const other = await pool.query(
      `INSERT INTO gt_contacts (tenant_id,is_live,name,prospect_id)
       VALUES ($1,false,'S. Rao',$2) RETURNING id`, [A, prospect]);
    const ctx = ctxFor(A);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: iso(WED, 1) }, ctx);
    const rao = await reserve_touch({ contact_id: Number(other.rows[0].id),
      channel: 'email', desired_at: iso(WED, 2) }, ctx);
    expect(rao.moved).toBe(false);
  });
});

d('sent touches and held slots both consume the window', () => {
  it('a manual send counts against the cap', async () => {
    // Counting only reservations would let a hand-written email slip past.
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);
    await log_touch({ prospect_id: prospect, contact_id: contact, channel: 'email',
      touched_at: WED }, ctx);
    await log_touch({ prospect_id: prospect, contact_id: contact, channel: 'email',
      touched_at: iso(WED, 1) }, ctx);

    const r = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 2) }, ctx);
    expect(r.moved).toBe(true);
    expect(r.competing.every((c) => c.kind === 'sent')).toBe(true);
  });

  it('a cancelled slot stops blocking', async () => {
    const { contact } = await seedAccount();
    const ctx = ctxFor(A);
    const a = await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    const b = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 1) }, ctx);
    await cancel_reservation({ reservation_id: b.reservation_id!, reason: 'Not needed' }, ctx);

    const c = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 2) }, ctx);
    expect(c.moved).toBe(false);
    expect(a.reservation_id).toBeTruthy();
  });

  it('refuses to cancel a slot that has already been sent', async () => {
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);
    const r = await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    await log_touch({ prospect_id: prospect, contact_id: contact, channel: 'email' }, ctx);
    await expect(cancel_reservation({ reservation_id: r.reservation_id! }, ctx))
      .rejects.toThrow(/already be sent or cancelled/);
  });
});

d('log_touch and reservations', () => {
  it('consumes the held slot for that person and channel', async () => {
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);
    const r = await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    const t = await log_touch({ prospect_id: prospect, contact_id: contact,
      channel: 'email' }, ctx);

    expect(t.reservation_consumed).toBe(r.reservation_id);
    const row = await pool.query(
      'SELECT status, touch_id::text FROM gt_touch_reservations WHERE id=$1', [r.reservation_id]);
    expect(row.rows[0].status).toBe('sent');
    expect(Number(row.rows[0].touch_id)).toBe(t.touch_id);
  });

  it('accepts a send with no reservation — writing by hand is legitimate', async () => {
    const { prospect, contact } = await seedAccount();
    const t = await log_touch({ prospect_id: prospect, contact_id: contact,
      channel: 'email' }, ctxFor(A));
    expect(t.reservation_consumed).toBeNull();
    expect(t.touch_id).toBeTruthy();
  });

  it('still works with no contact_id, but the touch is then invisible to the cap', async () => {
    // Honest about the limit rather than silently attributing the touch to
    // somebody. An unattributed send cannot count against a person.
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);
    await log_touch({ prospect_id: prospect, channel: 'email', touched_at: WED }, ctx);
    await log_touch({ prospect_id: prospect, channel: 'email', touched_at: iso(WED, 1) }, ctx);
    const r = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 2) }, ctx);
    expect(r.moved).toBe(false);
    expect(r.competing).toHaveLength(0);
  });

  it('refuses a contact from another tenant', async () => {
    const mine = await seedAccount(A);
    const theirs = await seedAccount(B);
    await expect(log_touch({ prospect_id: mine.prospect, contact_id: theirs.contact,
      channel: 'email' }, ctxFor(A))).rejects.toThrow(/No such contact/);
  });
});

/* ── Rule 12 ──────────────────────────────────────────────────────────── */

d('a move is never silent', () => {
  it('records both what was asked for and what was granted', async () => {
    const { contact } = await seedAccount();
    const ctx = ctxFor(A);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: iso(WED, 1) }, ctx);
    const c = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 2) }, ctx);

    const row = await pool.query(
      `SELECT requested_at, scheduled_at, moved_reason
         FROM gt_touch_reservations WHERE id=$1`, [c.reservation_id]);
    expect(new Date(row.rows[0].requested_at).toISOString()).toBe(new Date(iso(WED, 2)).toISOString());
    expect(row.rows[0].scheduled_at).not.toEqual(row.rows[0].requested_at);
    expect(row.rows[0].moved_reason).toMatch(/governor/i);
  });

  it('the database itself refuses a moved reservation with no reason', async () => {
    // The constraint means the move cannot become silent even by a coding
    // mistake in some future caller.
    const { contact } = await seedAccount();
    await expect(pool.query(
      `INSERT INTO gt_touch_reservations
         (tenant_id,is_live,contact_id,channel,requested_at,scheduled_at)
       VALUES ($1,false,$2,'email',$3::timestamptz,$4::timestamptz)`,
      [A, contact, WED, iso(WED, 3)])).rejects.toThrow(/chk_gt_resv_moved/);
  });

  it('writes nothing when the contact is saturated, and says when it clears', async () => {
    const { contact } = await seedAccount();
    const ctx = ctxFor(A);
    await set_policy({ max_touches: 1, window_days: 90, quiet_dows: [] }, ctx);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: WED }, ctx);

    const r = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: iso(WED, 1) }, ctx);
    expect(r.reservation_id).toBeNull();
    expect(r.blocked_by).toBe('saturated');
    expect(r.message).toMatch(/somebody else/i);

    const n = await pool.query(
      `SELECT count(*)::int n FROM gt_touch_reservations WHERE contact_id=$1`, [contact]);
    expect(n.rows[0].n).toBe(1);       // only the first — nothing squeezed in
  });
});

/* ── Quiet windows, end to end ────────────────────────────────────────── */

d('quiet windows', () => {
  it('moves a weekend request to the next working day', async () => {
    const { contact } = await seedAccount();
    // Saturday 2026-08-08, 11:00 IST.
    const r = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: '2026-08-08T11:00:00+05:30' }, ctxFor(A));
    expect(r.blocked_by).toBe('quiet');
    const day = new Date(r.scheduled_at!).toLocaleDateString('en-GB',
      { timeZone: 'Asia/Kolkata', weekday: 'short' });
    expect(day).toBe('Mon');
  });

  it('moves a late-evening request out of the silent band', async () => {
    const { contact } = await seedAccount();
    const r = await reserve_touch({ contact_id: contact, channel: 'email',
      desired_at: '2026-08-05T21:30:00+05:30' }, ctxFor(A));
    const hour = Number(new Date(r.scheduled_at!).toLocaleString('en-GB',
      { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }));
    expect(hour).toBeGreaterThanOrEqual(9);
    expect(hour).toBeLessThan(19);
  });
});

/* ── Policy ───────────────────────────────────────────────────────────── */

d('policy', () => {
  it('is seeded for existing tenants and reports its source', async () => {
    const p = await get_policy({}, ctxFor(A));
    expect(p.using_built_in).toBe(false);
    const r = await reserve_touch({ contact_id: (await seedAccount()).contact,
      channel: 'email', desired_at: WED }, ctxFor(A));
    expect(r.policy.source).toBe('tenant');
  });

  it('lets a channel-specific rule override the default', async () => {
    const { contact } = await seedAccount();
    const ctx = ctxFor(A);
    await set_policy({ channel: 'whatsapp', max_touches: 1, window_days: 7, quiet_dows: [] }, ctx);
    const a = await reserve_touch({ contact_id: contact, channel: 'whatsapp', desired_at: WED }, ctx);
    expect(a.policy.source).toBe('channel');
    expect(a.policy.max_touches).toBe(1);

    const b = await reserve_touch({ contact_id: contact, channel: 'whatsapp',
      desired_at: iso(WED, 1) }, ctx);
    expect(b.moved).toBe(true);
  });

  it('refuses values that would break scheduling outright', async () => {
    const ctx = ctxFor(A);
    await expect(set_policy({ max_touches: 0 }, ctx)).rejects.toThrow(/between 1 and 50/);
    await expect(set_policy({ window_days: 400 }, ctx)).rejects.toThrow(/between 1 and 90/);
    await expect(set_policy({ quiet_dows: [0, 1, 2, 3, 4, 5, 6] }, ctx))
      .rejects.toThrow(/All seven days/);
    await expect(set_policy({ quiet_from: '09:00' }, ctx)).rejects.toThrow(/both be empty/);
    await expect(set_policy({ timezone: 'Mars/Olympus' }, ctx)).rejects.toThrow(/not a timezone/);
  });

  it('updates in place rather than stacking duplicate rows', async () => {
    const ctx = ctxFor(A);
    await set_policy({ max_touches: 3 }, ctx);
    await set_policy({ max_touches: 4 }, ctx);
    const n = await pool.query(
      `SELECT count(*)::int n FROM gt_cadence_policy
        WHERE tenant_id=$1 AND is_live=false AND scope='contact' AND channel IS NULL`, [A]);
    expect(n.rows[0].n).toBe(1);
  });
});

/* ── The strip ────────────────────────────────────────────────────────── */

d('get_cadence — the strip', () => {
  it('shows sent, held and the moves with their reasons', async () => {
    const { prospect, contact } = await seedAccount();
    const ctx = ctxFor(A);
    await log_touch({ prospect_id: prospect, contact_id: contact, channel: 'email',
      touched_at: WED }, ctx);
    await reserve_touch({ contact_id: contact, channel: 'email', desired_at: iso(WED, 1) }, ctx);
    const moved = await reserve_touch({ contact_id: contact, channel: 'whatsapp',
      desired_at: iso(WED, 2) }, ctx);

    const strip = await get_cadence({ contact_id: contact, days: 30 }, ctx);
    expect(strip.contact.name).toBe('R. Menon');
    expect(strip.touches.filter((t) => t.kind === 'sent')).toHaveLength(1);
    expect(strip.touches.filter((t) => t.kind === 'held')).toHaveLength(2);
    expect(strip.moves).toHaveLength(1);
    expect(String(strip.moves[0].moved_reason)).toMatch(/governor/i);
    expect(moved.moved).toBe(true);
    expect(strip.policy.max_touches).toBe(2);
  });
});

/* ── The 3-check pattern ──────────────────────────────────────────────── */

d('tenant isolation', () => {
  it('valid data: a strip comes back for our own contact', async () => {
    const { contact } = await seedAccount(A);
    const s = await get_cadence({ contact_id: contact }, ctxFor(A));
    expect(s.contact.id).toBe(contact);
  });

  it('empty: a contact with nothing gets zeros, not an error', async () => {
    const { contact } = await seedAccount(A);
    const s = await get_cadence({ contact_id: contact }, ctxFor(A));
    expect(s.touches).toHaveLength(0);
    expect(s.in_window).toBe(0);
    expect(s.open_now).toBe(true);
  });

  it('wrong tenant: another tenant contact is invisible and unreservable', async () => {
    const mine = await seedAccount(A);
    await expect(get_cadence({ contact_id: mine.contact }, ctxFor(B)))
      .rejects.toThrow(/No such contact/);
    await expect(reserve_touch({ contact_id: mine.contact, channel: 'email' }, ctxFor(B)))
      .rejects.toThrow(/No such contact/);
    const n = await pool.query(
      `SELECT count(*)::int n FROM gt_touch_reservations WHERE contact_id=$1`, [mine.contact]);
    expect(n.rows[0].n).toBe(0);
  });

  it('one tenant reservations never enter another tenant window', async () => {
    const mine = await seedAccount(A);
    const theirs = await seedAccount(B);
    const ca = ctxFor(A); const cb = ctxFor(B);
    await reserve_touch({ contact_id: mine.contact, channel: 'email', desired_at: WED }, ca);
    await reserve_touch({ contact_id: mine.contact, channel: 'email', desired_at: iso(WED, 1) }, ca);
    const theirThird = await reserve_touch({ contact_id: theirs.contact, channel: 'email',
      desired_at: iso(WED, 2) }, cb);
    expect(theirThird.moved).toBe(false);
    expect(theirThird.competing).toHaveLength(0);
  });
});
