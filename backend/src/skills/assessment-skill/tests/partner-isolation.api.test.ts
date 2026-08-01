/**
 * VaNi AI — partner isolation, tested at the API level with real JWTs.
 *
 * WHY THIS TEST IS LOAD-BEARING
 * The runtime connects to Postgres as a BYPASSRLS role (CLAUDE.md: "RLS is
 * dormant"), so the RLS policies on gt_lead et al. enforce nothing today.
 * Partner isolation rests entirely on application-layer filtering:
 * resolvePartnerContext() reading gt_partner by ctx.user_id, and the
 * `$partner_id::uuid IS NULL OR ...` clause in the skill's SQL. This test
 * is the only thing standing between that and a partner reading another
 * partner's leads. Treat a failure here as a security incident, not a
 * flaky test.
 *
 * Mints genuine JWTs via the real token service and drives the real HTTP
 * endpoints, so it covers the whole path — JWT -> resolveAuth ->
 * SkillContext -> skill function -> SQL — not just the skill function in
 * isolation.
 *
 * Skips (does not fail) when the API isn't running, matching this repo's
 * existing *.db.test.ts convention. Run it with:
 *   cd backend && npm run dev            # in one terminal
 *   npx jest src/skills/assessment-skill/tests/partner-isolation.api.test.ts
 */

// Jest does not load .env the way tsx does — without this the test reads no
// DB_PRIMARY/JWT_SECRET and silently skips, which looks like a pass.
import 'dotenv/config';
import { execSync } from 'child_process';
import { Pool } from 'pg';
import { signAccessToken } from '../../../auth/token.service';

const API = process.env.TEST_API_ORIGIN || `http://localhost:${process.env.PORT || 3002}`;
const SKILL = `${API}/api/v1/skills/assessment-skill`;

const SUFFIX = 'isolation-test';

let pool: Pool;

// Must be decided SYNCHRONOUSLY, at module load: jest evaluates describe()
// blocks during collection, before any beforeAll runs, so an async
// availability flag would still be false when the skip decision is made —
// the suite would silently skip even with the API up. Same reason the
// repo's existing *.db.test.ts shells out to pg_isready rather than
// probing asynchronously.
const available: boolean = (() => {
  if (!process.env.DB_PRIMARY || !process.env.JWT_SECRET) return false;
  const origin = process.env.TEST_API_ORIGIN || `http://localhost:${process.env.PORT || 3002}`;
  try {
    execSync(`curl -sSf --max-time 3 ${origin}/health`, { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

// Seeded per-run
let tenantId = '';
let userA = '';
let userB = '';
let partnerA = '';
let partnerB = '';
let leadA = '';
let leadB = '';
let tokenA = '';
let tokenB = '';

function jwtFor(userId: string): string {
  // Real signing key, real payload shape — resolveAuth on the server side
  // reads exactly these fields.
  return signAccessToken({
    user_id: userId,
    tenant_id: tenantId,
    email: `${userId}@${SUFFIX}.local`,
    role: 'user',
    is_live: true,
    is_admin: false,
  });
}

async function callSkill(fn: string, token: string, params: Record<string, unknown> = {}) {
  const res = await fetch(`${SKILL}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ params }),
  });
  return { status: res.status, body: await res.json() as any };
}

beforeAll(async () => {
  if (!available) return;

  pool = new Pool({ connectionString: process.env.DB_PRIMARY, max: 3 });

  const t = await pool.query<{ id: string }>(
    `SELECT id FROM vn_tenants WHERE slug = 'vikuna-consulting'`);
  if (!t.rows[0]) throw new Error('vikuna-consulting tenant missing — run npm run db:migrate first');
  tenantId = t.rows[0].id;

  // Clean slate. vn_users has no unique constraint on email alone, so
  // ON CONFLICT can't be used — delete any leftovers from a previous run
  // first, in FK order.
  await cleanup();

  // Two partner users, each owning one lead. Suffixed so cleanup is exact
  // and a stray run can never touch real data.
  for (const which of ['a', 'b'] as const) {
    const u = await pool.query<{ id: string }>(
      `INSERT INTO vn_users (tenant_id, email, password_hash, name, intake_code, is_active, is_email_verified)
       VALUES ($1, $2, 'x', $3, $4, true, true)
       RETURNING id`,
      [tenantId, `partner-${which}@${SUFFIX}.local`, `Partner ${which.toUpperCase()}`, `ISO-${which}`]);
    const userId = u.rows[0].id;

    const p = await pool.query<{ id: string }>(
      `INSERT INTO gt_partner (tenant_id, user_id, role, ref_code, display_name)
       VALUES ($1, $2, 'partner', $3, $4)
       RETURNING id`,
      [tenantId, userId, `${SUFFIX}-${which}`, `Partner ${which.toUpperCase()}`]);
    const partnerId = p.rows[0].id;

    const l = await pool.query<{ id: string }>(
      `INSERT INTO gt_lead (tenant_id, partner_id, lead_no, name, email, company, role_title)
       VALUES ($1, $2, $3, $4, $5, $6, 'Tester')
       RETURNING id`,
      [tenantId, partnerId, `ISO-${which.toUpperCase()}`, `Lead ${which}`,
       `lead-${which}@${SUFFIX}.local`, `Company ${which.toUpperCase()}`]);

    if (which === 'a') { userA = userId; partnerA = partnerId; leadA = l.rows[0].id; }
    else               { userB = userId; partnerB = partnerId; leadB = l.rows[0].id; }
  }

  tokenA = jwtFor(userA);
  tokenB = jwtFor(userB);
}, 30000);

// Removes every row this test creates, in FK order. Used both to clear
// leftovers before seeding and to tidy up after.
async function cleanup() {
  await pool.query(`DELETE FROM gt_lead_event WHERE lead_id IN (SELECT id FROM gt_lead WHERE email LIKE $1)`, [`%@${SUFFIX}.local`]);
  await pool.query(`DELETE FROM gt_lead WHERE email LIKE $1`, [`%@${SUFFIX}.local`]);
  await pool.query(`DELETE FROM gt_partner WHERE user_id IN (SELECT id FROM vn_users WHERE email LIKE $1)`, [`%@${SUFFIX}.local`]);
  await pool.query(`DELETE FROM vn_users WHERE email LIKE $1`, [`%@${SUFFIX}.local`]);
}

afterAll(async () => {
  if (!pool) return;
  await cleanup();
  await pool.end();
});

const maybeDescribe = available ? describe : describe.skip;

maybeDescribe('partner isolation (API level, real JWTs)', () => {

  it('two partners see disjoint lead sets', async () => {
    const a = await callSkill('get_leads', tokenA);
    const b = await callSkill('get_leads', tokenB);

    const idsA: string[] = (a.body.data?.leads ?? []).map((l: any) => l.id);
    const idsB: string[] = (b.body.data?.leads ?? []).map((l: any) => l.id);

    expect(idsA).toContain(leadA);
    expect(idsB).toContain(leadB);

    // The actual isolation assertion: no overlap, in either direction.
    expect(idsA).not.toContain(leadB);
    expect(idsB).not.toContain(leadA);
    expect(idsA.filter((id) => idsB.includes(id))).toEqual([]);
  });

  it('a partner cannot read another partner\'s lead by id', async () => {
    const res = await callSkill('get_lead', tokenA, { lead_id: leadB });

    // What matters: no lead data comes back.
    expect(res.body?.data?.lead).toBeFalsy();
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.error)).toMatch(/LEAD_NOT_FOUND/);

    // Documents CURRENT transport behaviour, which is not what Phase C3
    // asked for. The generic skill executor (server.ts) returns HTTP 200
    // with { success: false } for EVERY handler error — there is no path
    // to a 403 without changing that shared executor, which all 17 skills
    // run through. Flagged in the C3 report with a recommended fix
    // (dedicated console routes that map errors to real status codes).
    // Change this expectation when that lands — do not delete it.
    expect(res.status).toBe(200);
  });

  it('a partner cannot mutate another partner\'s lead', async () => {
    const status = await callSkill('update_lead_status', tokenA, { lead_id: leadB, status: 'contacted' });
    expect(status.body?.success).toBe(false);

    const note = await callSkill('add_lead_note', tokenA, { lead_id: leadB, text: 'should not land' });
    expect(note.body?.success).toBe(false);

    // Prove it at the source of truth, not just the response envelope.
    const row = await pool.query(`SELECT status FROM gt_lead WHERE id = $1`, [leadB]);
    expect(row.rows[0].status).toBe('new');
    const notes = await pool.query(
      `SELECT count(*)::int AS n FROM gt_lead_event WHERE lead_id = $1 AND event_type = 'note'`, [leadB]);
    expect(notes.rows[0].n).toBe(0);
  });

  it('a user with no gt_partner row gets no console access at all', async () => {
    const orphan = await pool.query<{ id: string }>(
      `INSERT INTO vn_users (tenant_id, email, password_hash, name, intake_code, is_active, is_email_verified)
       VALUES ($1, $2, 'x', 'Orphan', 'ISO-O', true, true) RETURNING id`,
      [tenantId, `orphan@${SUFFIX}.local`]);

    const res = await callSkill('get_leads', jwtFor(orphan.rows[0].id));
    expect(res.body?.success).toBe(false);
    expect(String(res.body?.error)).toMatch(/NO_VANI_CONSOLE_ACCESS/);
  });
});
