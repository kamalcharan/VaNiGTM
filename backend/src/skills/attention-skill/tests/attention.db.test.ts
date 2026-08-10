/**
 * /today against a real database.
 *
 * The ranking arithmetic is boring and would pass in a unit test. What is
 * guarded here is everything the screen depends on being true of storage:
 *
 *  1. Every reason fires for the right account, and only that one.
 *  2. The quiet window holds gap-based reasons back and lets event-based
 *     ones through — a reply on day one must not wait a fortnight.
 *  3. Suppression: a held future reservation, a live snooze, a dismissal.
 *     And the inverses — a stale reservation and an expired snooze both
 *     bring the account back.
 *  4. The fold takes the TAIL of the decision log, so dismiss-then-reopen
 *     shows.
 *  5. The counts the empty states read agree with the page. They are
 *     separate queries over shared CTEs; if they ever disagree the screen
 *     explains itself with numbers that contradict what is on it.
 *  6. Tenant and environment isolation.
 *  7. The table really is append-only.
 *
 * ── THE BUG THIS FILE ALREADY CAUGHT ──────────────────────────────────
 *
 * `standing` is a LEFT JOIN, so an account nobody has decided about has a
 * NULL decision, and `s.decision = 'dismissed'` is NULL rather than false.
 * `WHERE NOT is_dismissed` then drops the row. The surviving rows were
 * exactly the ones somebody had already dealt with — a new tenant's screen
 * was empty *because* nothing had been decided yet. Reading the SQL did not
 * find it; eighteen fixtures did.
 *
 * Skips without a database.
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import { bootstrapSchema, cleanBetweenTests } from '../../__test-helpers__/schema';
import { createTenantDb } from '../../../db';
import { get_attention } from '../functions/get-attention';
import { decide_attention } from '../functions/decide-attention';
import type { SkillContext } from '../../../types/skill.types';

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

const d = available ? describe : describe.skip;

let pool: Pool;
let A: string;
let B: string;

const ctxFor = (tenant: string, isLive = true): SkillContext => ({
  tenant_id: tenant,
  is_live: isLive,
  user_id: '11111111-1111-1111-1111-111111111111',
  is_admin: false,
  db: createTenantDb(pool, tenant),
});

/** A prospect with a journey. Returns the prospect id. */
async function mkAccount(
  tenant: string, name: string, state: string,
  enteredDaysAgo: number, opts: { wakeInDays?: number; isLive?: boolean } = {},
): Promise<number> {
  const isLive = opts.isLive ?? true;
  const p = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1, $2, $3) RETURNING id`,
    [tenant, isLive, name]);
  const pid = Number(p.rows[0].id);
  await pool.query(
    `INSERT INTO gt_journeys (tenant_id, is_live, prospect_id, state, entered_state_at, wake_at)
     VALUES ($1, $2, $3, $4, now() - ($5 || ' days')::interval,
             CASE WHEN $6::int IS NULL THEN NULL
                  ELSE now() + ($6 || ' days')::interval END)`,
    [tenant, isLive, pid, state, String(enteredDaysAgo),
     opts.wakeInDays === undefined ? null : opts.wakeInDays]);
  return pid;
}

async function touch(
  tenant: string, pid: number, daysAgo: number,
  outcome: string | null = null, isLive = true,
): Promise<void> {
  await pool.query(
    `INSERT INTO gt_touch_log
       (tenant_id, is_live, prospect_id, channel, touched_at, outcome, outcome_at)
     VALUES ($1, $2, $3, 'email', now() - ($4 || ' days')::interval, $5::text,
             CASE WHEN $5::text IS NULL THEN NULL
                  ELSE now() - ($4 || ' days')::interval END)`,
    [tenant, isLive, pid, String(daysAgo), outcome]);
}

/** A contact on the account plus a held reservation `inDays` from now. */
async function reserve(tenant: string, pid: number, inDays: number): Promise<void> {
  const c = await pool.query(
    `INSERT INTO gt_contacts (tenant_id, is_live, name, prospect_id)
     VALUES ($1, true, 'Someone', $2) RETURNING id`, [tenant, pid]);
  await pool.query(
    `INSERT INTO gt_touch_reservations
       (tenant_id, is_live, contact_id, channel, requested_at, scheduled_at, status)
     VALUES ($1, true, $2, 'email',
             now() + ($3 || ' days')::interval, now() + ($3 || ' days')::interval, 'held')`,
    [tenant, Number(c.rows[0].id), String(inDays)]);
}

const byCompany = (items: { company: string }[]) => items.map((i) => i.company);

d('attention-skill · /today', () => {
  beforeAll(async () => {
    pool = new Pool({
      host: process.env.PGHOST || '/tmp',
      port: Number(process.env.PGPORT || 55432),
      database: process.env.PGDATABASE || 'postgres',
    });
    const t = await bootstrapSchema(pool, ['238_gt_attention_decision.sql']);
    A = t.A; B = t.B;
  });

  afterAll(async () => { await pool?.end(); });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE gt_attention_decision RESTART IDENTITY CASCADE');
    await cleanBetweenTests(pool);
  });

  /* ── 1 + 2 · reasons and the quiet window ────────────────────────── */

  it('surfaces each reason, and only the accounts that earn it', async () => {
    await touch(A, await mkAccount(A, 'gone quiet', 'waiting', 60), 40);
    await touch(A, await mkAccount(A, 'too recent', 'waiting', 60), 3);
    await touch(A, await mkAccount(A, 'owed reply', 'waiting', 60), 2, 'replied');
    await mkAccount(A, 'never touched', 'qualified', 30);
    await mkAccount(A, 'just qualified', 'qualified', 2);
    await touch(A, await mkAccount(A, 'story unsent', 'ready', 30), 30);
    await mkAccount(A, 'wake due', 'parked', 90, { wakeInDays: -1 });
    await mkAccount(A, 'wake later', 'parked', 90, { wakeInDays: 10 });
    await touch(A, await mkAccount(A, 'ruled out', 'ruled_out', 400), 400);

    const res = await get_attention({}, ctxFor(A));
    const names = byCompany(res.items);

    expect(names).toContain('gone quiet');
    expect(names).toContain('owed reply');
    expect(names).toContain('never touched');
    expect(names).toContain('story unsent');
    expect(names).toContain('wake due');

    // The window holds gap-based reasons back...
    expect(names).not.toContain('too recent');
    expect(names).not.toContain('just qualified');
    // ...a wake date in the future is not due...
    expect(names).not.toContain('wake later');
    // ...and closed relationships are supposed to be silent.
    expect(names).not.toContain('ruled out');

    const reason = (c: string) => res.items.find((i) => i.company === c)!.reason;
    expect(reason('wake due')).toBe('wake_due');
    expect(reason('owed reply')).toBe('owed_reply');
    expect(reason('story unsent')).toBe('story_unsent');
    expect(reason('gone quiet')).toBe('gone_quiet');
    expect(reason('never touched')).toBe('never_touched');
  });

  it('lets a reply through on day one — it does not wait out the window', async () => {
    await touch(A, await mkAccount(A, 'replied yesterday', 'waiting', 60), 1, 'replied');
    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['replied yesterday']);
    expect(res.items[0].days_quiet).toBeLessThan(2);
  });

  it('ranks by reason band first and silence only within a band', async () => {
    // The ancient one would win on days_quiet alone. It must not.
    await mkAccount(A, 'ancient prospecting', 'qualified', 900);
    await touch(A, await mkAccount(A, 'they replied', 'waiting', 60), 20, 'replied');

    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['they replied', 'ancient prospecting']);
  });

  it('caps the silence term so an ancient row cannot outrank a live one forever', async () => {
    await touch(A, await mkAccount(A, 'quiet 200d', 'waiting', 400), 200);
    await touch(A, await mkAccount(A, 'quiet 95d', 'waiting', 400), 95);
    const res = await get_attention({}, ctxFor(A));
    // Both are past max_days_counted (90), so they tie on score and fall
    // through to days_quiet — the cap flattens the band rather than
    // reversing it.
    expect(res.items[0].score).toBe(res.items[1].score);
    expect(byCompany(res.items)).toEqual(['quiet 200d', 'quiet 95d']);
  });

  /* ── 3 · suppression, and its inverses ───────────────────────────── */

  it('suppresses an account that already has a held reservation ahead of it', async () => {
    const queued = await mkAccount(A, 'queued', 'waiting', 60);
    await touch(A, queued, 40);
    await reserve(A, queued, 2);

    const stale = await mkAccount(A, 'stale reservation', 'waiting', 60);
    await touch(A, stale, 40);
    await reserve(A, stale, -5);   // scheduled in the past — not handled

    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['stale reservation']);
    expect(res.context.suppressed_handled).toBe(1);
  });

  it('honours a live snooze and forgets an expired one', async () => {
    const live = await mkAccount(A, 'snoozed', 'waiting', 60);
    await touch(A, live, 40);
    await decide_attention(
      { prospect_id: live, decision: 'snoozed', snooze_days: 7 }, ctxFor(A));

    const expired = await mkAccount(A, 'snooze expired', 'waiting', 60);
    await touch(A, expired, 40);
    await pool.query(
      `INSERT INTO gt_attention_decision (tenant_id, is_live, prospect_id, decision, snooze_until)
       VALUES ($1, true, $2, 'snoozed', now() - interval '1 day')`, [A, expired]);

    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['snooze expired']);
    expect(res.context.suppressed_snoozed).toBe(1);
    expect(res.context.next_snooze_due).not.toBeNull();
  });

  it('hides a dismissal, and shows it back on request', async () => {
    const pid = await mkAccount(A, 'dismissed', 'waiting', 60);
    await touch(A, pid, 40);
    await decide_attention(
      { prospect_id: pid, decision: 'dismissed', reason: 'not our market' }, ctxFor(A));

    expect((await get_attention({}, ctxFor(A))).items).toHaveLength(0);
    const shown = await get_attention({ include_dismissed: true }, ctxFor(A));
    expect(byCompany(shown.items)).toEqual(['dismissed']);
  });

  /* ── 4 · the fold takes the tail ─────────────────────────────────── */

  it('takes the LATEST decision, so reopening undoes a dismissal', async () => {
    const pid = await mkAccount(A, 'reopened', 'waiting', 60);
    await touch(A, pid, 40);
    await decide_attention(
      { prospect_id: pid, decision: 'dismissed', reason: 'mistake' }, ctxFor(A));
    await decide_attention({ prospect_id: pid, decision: 'reopened' }, ctxFor(A));

    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['reopened']);
    expect(res.items[0].standing_decision).toBe('reopened');

    // Nothing was overwritten getting here.
    const log = await pool.query(
      'SELECT decision FROM gt_attention_decision WHERE prospect_id = $1 ORDER BY id', [pid]);
    expect(log.rows.map((r) => r.decision)).toEqual(['dismissed', 'reopened']);
  });

  it('does not treat an "acted" decision as a touch', async () => {
    const pid = await mkAccount(A, 'acted but not sent', 'waiting', 60);
    await touch(A, pid, 40);
    await decide_attention({ prospect_id: pid, decision: 'acted' }, ctxFor(A));

    // Recency comes from gt_touch_log alone. Clicking "act" and then never
    // sending anything must leave the account exactly as quiet as it was.
    const res = await get_attention({}, ctxFor(A));
    expect(byCompany(res.items)).toEqual(['acted but not sent']);
    expect(res.items[0].days_quiet).toBeGreaterThanOrEqual(40);
  });

  /* ── 5 · the counts agree with the page ──────────────────────────── */

  it('reports counts that add up to what is on screen', async () => {
    const a = await mkAccount(A, 'surfaced', 'waiting', 60); await touch(A, a, 40);
    const h = await mkAccount(A, 'handled', 'waiting', 60);  await touch(A, h, 40); await reserve(A, h, 3);
    const s = await mkAccount(A, 'snoozed', 'waiting', 60);  await touch(A, s, 40);
    const x = await mkAccount(A, 'dismissed', 'waiting', 60); await touch(A, x, 40);
    await decide_attention({ prospect_id: s, decision: 'snoozed', snooze_days: 5 }, ctxFor(A));
    await decide_attention(
      { prospect_id: x, decision: 'dismissed', reason: 'no' }, ctxFor(A));

    const res = await get_attention({}, ctxFor(A));
    const c = res.context;
    expect(c.surfaced).toBe(res.items.length);
    expect(c.matched).toBe(
      c.surfaced + c.suppressed_handled + c.suppressed_snoozed + c.suppressed_dismissed);
  });

  it('names the right empty state for each kind of empty', async () => {
    expect((await get_attention({}, ctxFor(A))).empty_state).toBe('no_accounts');

    // Companies exist, none qualified — the research queue's job, and
    // "all caught up" would be a lie about a pipeline nobody filled.
    await pool.query(
      `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1, true, 'unqualified')`, [A]);
    expect((await get_attention({}, ctxFor(A))).empty_state).toBe('none_in_play');

    // In play, inside the window: genuinely up to date.
    await touch(A, await mkAccount(A, 'fresh', 'waiting', 60), 1);
    expect((await get_attention({}, ctxFor(A))).empty_state).toBe('all_current');

    // Something was surfaceable and has been dealt with.
    const q = await mkAccount(A, 'quiet', 'waiting', 60);
    await touch(A, q, 40);
    expect((await get_attention({}, ctxFor(A))).empty_state).toBe('has_items');
    await decide_attention(
      { prospect_id: q, decision: 'dismissed', reason: 'done' }, ctxFor(A));
    expect((await get_attention({}, ctxFor(A))).empty_state).toBe('all_handled');
  });

  /* ── 6 · isolation ───────────────────────────────────────────────── */

  it('does not leak across tenants or environments', async () => {
    await touch(B, await mkAccount(B, 'theirs', 'waiting', 300), 300);
    await touch(A, await mkAccount(A, 'sandbox', 'waiting', 200, { isLive: false }), 200, null, false);
    await touch(A, await mkAccount(A, 'ours', 'waiting', 60), 40);

    expect(byCompany((await get_attention({}, ctxFor(A))).items)).toEqual(['ours']);
    expect(byCompany((await get_attention({}, ctxFor(B))).items)).toEqual(['theirs']);
    expect((await get_attention({}, ctxFor(A, false))).items.map((i) => i.company))
      .toEqual(['sandbox']);
  });

  it('refuses to record a decision about another tenant\'s account', async () => {
    const theirs = await mkAccount(B, 'theirs', 'waiting', 60);
    await expect(
      decide_attention({ prospect_id: theirs, decision: 'acted' }, ctxFor(A)),
    ).rejects.toThrow(/No such account/);
  });

  /* ── 7 · append-only is enforced by the database ─────────────────── */

  it('refuses to update or delete a decision', async () => {
    const pid = await mkAccount(A, 'x', 'waiting', 60);
    await decide_attention(
      { prospect_id: pid, decision: 'dismissed', reason: 'because' }, ctxFor(A));

    await expect(pool.query(
      `UPDATE gt_attention_decision SET reason = 'rewritten' WHERE prospect_id = $1`, [pid]))
      .rejects.toThrow(/append-only/);
    await expect(pool.query(
      `DELETE FROM gt_attention_decision WHERE prospect_id = $1`, [pid]))
      .rejects.toThrow(/append-only/);

    // ...but the FK cascade still works, which the first implementation
    // (DO INSTEAD NOTHING rules) broke: one dismissed account made the
    // prospect, and through the tenant cascade the tenant, undeletable.
    await pool.query('DELETE FROM gt_prospects WHERE id = $1', [pid]);
    const left = await pool.query(
      'SELECT count(*)::int AS n FROM gt_attention_decision WHERE prospect_id = $1', [pid]);
    expect(left.rows[0].n).toBe(0);
  });

  it('requires a reason to dismiss and a future date to snooze', async () => {
    const pid = await mkAccount(A, 'x', 'waiting', 60);
    await expect(decide_attention({ prospect_id: pid, decision: 'dismissed' }, ctxFor(A)))
      .rejects.toThrow(/reason/i);
    await expect(decide_attention(
      { prospect_id: pid, decision: 'snoozed', snooze_until: '2020-01-01' }, ctxFor(A)))
      .rejects.toThrow(/future/i);
    await expect(decide_attention(
      { prospect_id: pid, decision: 'acted', snooze_days: 3 }, ctxFor(A)))
      .rejects.toThrow(/only applies/i);
  });
});
