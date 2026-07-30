/**
 * Promoting a named contact from a brief.
 *
 * The single biggest liability guarded here is R-C1: a brief that named
 * nobody must not silently yield anybody, and this function is the only
 * door to source='research' contacts. If that door leaks, "info@" gets
 * written under 'research' and quietly corrupts the promoted evidence.
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
import { promote_from_brief } from '../functions/promote-from-brief';
import { list_brief_contacts } from '../functions/list-brief-contacts';
import { findJourney, ensureJourney, moveByProspect } from '../../journey-skill/journey.service';

/* The full gt_contacts + gt_contact_channels schema. The prod migration
 * (187) does a legacy rename that assumes ki_contacts existed, which the
 * test bootstrap does not — so tables are declared inline, matching the
 * columns the code actually reads. */
const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, slug VARCHAR(80));

CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(32), name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), city VARCHAR(120), industry_raw TEXT, completeness NUMERIC(4,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE gt_contacts (
  id             BIGSERIAL PRIMARY KEY,
  tenant_id      UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live        BOOLEAN NOT NULL DEFAULT false,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  contact_no     TEXT,
  prefix         VARCHAR(20),
  name           VARCHAR(300) NOT NULL,
  normalized_name TEXT,
  job_title      VARCHAR(200),
  company_name   VARCHAR(255),
  company_domain VARCHAR(255),
  linkedin_url   VARCHAR(500),
  location       VARCHAR(200),
  source         VARCHAR(40) NOT NULL DEFAULT 'manual',
  external_ref   TEXT,
  raw            JSONB NOT NULL DEFAULT '{}'::jsonb,
  score          INTEGER NOT NULL DEFAULT 0,
  prospect_id    BIGINT REFERENCES gt_prospects(id) ON DELETE SET NULL,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gt_contact_channels (
  id              BIGSERIAL PRIMARY KEY,
  contact_id      BIGINT NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live         BOOLEAN NOT NULL DEFAULT false,
  channel_type    VARCHAR(50) NOT NULL CHECK (channel_type IN
    ('email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other')),
  channel_value   VARCHAR(255) NOT NULL,
  channel_subtype VARCHAR(50) NOT NULL DEFAULT 'personal',
  is_primary      BOOLEAN NOT NULL DEFAULT false,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_gt_contact_channel UNIQUE (contact_id, channel_type, channel_value, is_live)
);

CREATE TABLE gt_seq_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, sequence_type TEXT NOT NULL,
  prefix TEXT NOT NULL, last_value INTEGER NOT NULL DEFAULT 0,
  pad_width INTEGER NOT NULL DEFAULT 4,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sequence_type)
);
CREATE FUNCTION gt_next_seq(p_tenant UUID, p_type TEXT) RETURNS TEXT AS $$
DECLARE v INT;
BEGIN
  INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
  VALUES (p_tenant, p_type, UPPER(LEFT(p_type,4)))
  ON CONFLICT DO NOTHING;
  UPDATE gt_seq_counters SET last_value = last_value + 1
   WHERE tenant_id = p_tenant AND sequence_type = p_type
   RETURNING last_value INTO v;
  RETURN UPPER(LEFT(p_type,4)) || '-' || LPAD(v::text, 4, '0');
END $$ LANGUAGE plpgsql;

CREATE FUNCTION set_tenant_context(t UUID) RETURNS void AS $$
  BEGIN PERFORM set_config('app.current_tenant_id', t::text, true); END $$ LANGUAGE plpgsql;
`;

let pool: Pool;
const ctxFor = (tenant: string) => ({
  tenant_id: tenant, is_live: false, user_id: A, is_admin: false,
  db: createTenantDb(pool, tenant),
});
const scope = { tenant_id: A, is_live: false };

async function seedBrief(named: Array<Record<string, string | null>>, tenant = A) {
  const p = await pool.query(
    `INSERT INTO gt_prospects (tenant_id, is_live, name) VALUES ($1,false,'Sriveda') RETURNING id`, [tenant]);
  const prospect = Number(p.rows[0].id);
  const b = await pool.query(
    `INSERT INTO gt_account_briefs
       (tenant_id, is_live, prospect_id, status, domain, named_contacts, facts_at)
     VALUES ($1, false, $2, 'drafted', 'sriveda.example', $3::jsonb, now())
     RETURNING id`,
    [tenant, prospect, JSON.stringify(named)]);
  return { prospect, brief: Number(b.rows[0].id) };
}

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS promote_test');
  await admin.query('CREATE DATABASE promote_test');
  await admin.end();
  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'promote_test' });
  await pool.query(BASE);
  await pool.query(`INSERT INTO vn_tenants (id,slug) VALUES ($1,'us'),($2,'them')`, [A, B]);
  for (const m of ['207_gt_account_briefs.sql', '210_brief_extract_failed.sql',
                   '211_brief_facts_and_judgement.sql', '213_brief_human_offer.sql',
                   '221_gt_touch_log.sql', '222_gt_journeys.sql',
                   '223_gt_cadence_governor.sql', '224_contact_evidence.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('DELETE FROM gt_journey_events');
  await pool.query('DELETE FROM gt_journeys');
  await pool.query('DELETE FROM gt_touch_log');
  await pool.query('DELETE FROM gt_contact_channels');
  await pool.query('DELETE FROM gt_contacts');
  await pool.query('DELETE FROM gt_account_briefs');
  await pool.query('DELETE FROM gt_prospects');
  await pool.query('DELETE FROM gt_touch_reservations');
});

const d = available ? describe : describe.skip;

/* ── R-C1: no invented people ─────────────────────────────────────────── */

d('R-C1 — no invented people', () => {
  it('refuses to promote from a brief that named nobody', async () => {
    // The whole reason 'research' is not a shortcut for create_contact.
    // Silently accepting a name in this codepath is how "info@" ends up
    // tagged with research provenance.
    const { brief } = await seedBrief([]);
    await expect(promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A)))
      .rejects.toThrow(/named nobody/i);
  });

  it('refuses an index the brief does not have', async () => {
    const { brief } = await seedBrief([{ name: 'R. Menon' }]);
    await expect(promote_from_brief({ brief_id: brief, named_index: 5 }, ctxFor(A)))
      .rejects.toThrow(/out of range/i);
  });

  it('refuses an entry that carries no name', async () => {
    const { brief } = await seedBrief([{ email: 'x@sriveda.example' }]);
    await expect(promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A)))
      .rejects.toThrow(/no name/i);
  });

  it('lists nothing rather than throwing on an empty brief', async () => {
    // The reviewer's screen has to render something honest — "the flow
    // will not invent one" is the answer, not an error page.
    const { brief } = await seedBrief([]);
    const r = await list_brief_contacts({ brief_id: brief }, ctxFor(A));
    expect(r.entries).toHaveLength(0);
    expect(r.empty_reason).toMatch(/named nobody/i);
  });
});

/* ── The successful promotion ─────────────────────────────────────────── */

d('promoting a person', () => {
  it('writes a contact with source=research, the brief_id, and its evidence URL on the channel', async () => {
    const { brief } = await seedBrief([
      { name: 'R. Menon', title: 'Head of Digital', email: 'r.menon@sriveda.example' },
    ]);
    const r = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    expect(r.created).toBe(true);
    expect(r.channels_written).toHaveLength(1);
    expect(r.channels_written[0].source_url).toBe('https://sriveda.example');

    const c = await pool.query(
      `SELECT source, brief_id::text, raw->>'named_index' AS idx, job_title
         FROM gt_contacts WHERE id = $1`, [r.contact_id]);
    expect(c.rows[0].source).toBe('research');
    expect(Number(c.rows[0].brief_id)).toBe(brief);
    expect(c.rows[0].idx).toBe('0');
    expect(c.rows[0].job_title).toBe('Head of Digital');

    const ch = await pool.query(
      `SELECT channel_type, channel_value, source_url, is_primary
         FROM gt_contact_channels WHERE contact_id = $1`, [r.contact_id]);
    expect(ch.rows[0].source_url).toBe('https://sriveda.example');
    expect(ch.rows[0].is_primary).toBe(true);
  });

  it('is idempotent on (brief, index) — same call, same row', async () => {
    // Reviewers double-click; agents retry; the promotion must not double.
    // Uniqueness is on the pair, not the name — two people in a brief may
    // share a name, and the array position is the only stable identifier.
    const { brief } = await seedBrief([
      { name: 'R. Menon', email: 'r.menon@sriveda.example' },
    ]);
    const first = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    const second = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    expect(first.contact_id).toBe(second.contact_id);
    expect(second.created).toBe(false);
    const n = await pool.query(
      `SELECT count(*)::int n FROM gt_contacts WHERE brief_id = $1`, [brief]);
    expect(n.rows[0].n).toBe(1);
  });

  it('promotes two same-named people at different indices as two contacts', async () => {
    const { brief } = await seedBrief([
      { name: 'R. Rao', title: 'CFO', email: 'rao1@sriveda.example' },
      { name: 'R. Rao', title: 'Plant Head', email: 'rao2@sriveda.example' },
    ]);
    const a = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    const b = await promote_from_brief({ brief_id: brief, named_index: 1 }, ctxFor(A));
    expect(a.contact_id).not.toBe(b.contact_id);
  });

  it('respects a caller correction while keeping the brief URL as evidence', async () => {
    // A typo in an evidenced address is still a real correction, but the URL
    // evidences that the PERSON exists at that company, not the exact string.
    const { brief } = await seedBrief([
      { name: 'R. Menon', email: 'rmenno@sriveda.example' },  // typo
    ]);
    const r = await promote_from_brief(
      { brief_id: brief, named_index: 0, email: 'r.menon@sriveda.example' }, ctxFor(A));
    const ch = await pool.query(
      `SELECT channel_value, source_url FROM gt_contact_channels WHERE contact_id = $1`, [r.contact_id]);
    expect(ch.rows[0].channel_value).toBe('r.menon@sriveda.example');
    expect(ch.rows[0].source_url).toBe('https://sriveda.example');
  });

  it('accepts extra channels the human found, but leaves source_url NULL on them', async () => {
    // Extras are human-typed. Pretending the brief evidenced an address the
    // brief did not contain would be exactly the silent lie rule 12 forbids.
    const { brief } = await seedBrief([{ name: 'R. Menon', email: 'r.menon@sriveda.example' }]);
    const r = await promote_from_brief({
      brief_id: brief, named_index: 0,
      extra_channels: [{ channel_type: 'linkedin', channel_value: 'linkedin.com/in/rmenon' }],
    }, ctxFor(A));
    const ch = await pool.query(
      `SELECT channel_type, source_url FROM gt_contact_channels
        WHERE contact_id = $1 ORDER BY channel_type`, [r.contact_id]);
    const linkedin = ch.rows.find((x) => x.channel_type === 'linkedin');
    const email = ch.rows.find((x) => x.channel_type === 'email');
    expect(linkedin?.source_url).toBeNull();
    expect(email?.source_url).toBe('https://sriveda.example');
  });

  it('drops "not stated" idioms rather than writing them as channel values', async () => {
    const { brief } = await seedBrief([{ name: 'R. Menon', email: 'not stated' }]);
    const r = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    expect(r.channels_written).toHaveLength(0);
  });
});

/* ── The `addressed` gate ─────────────────────────────────────────────── */

d('the addressed gate', () => {
  it('moves the journey to addressed when confirmed with a channel', async () => {
    const { prospect, brief } = await seedBrief([
      { name: 'R. Menon', email: 'r.menon@sriveda.example' },
    ]);
    // The journey must be at 'qualified' to move forward legitimately.
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'qualified');

    const r = await promote_from_brief({
      brief_id: brief, named_index: 0, confirm_addressed: true,
    }, ctxFor(A));
    expect(r.journey_moved).toBe(true);
    expect(r.journey_state).toBe('addressed');

    const j = await findJourney(db, scope, prospect);
    expect(j!.contact_id).toBe(r.contact_id);
  });

  it('R-C2 — refuses to confirm addressed with no channel', async () => {
    const { brief } = await seedBrief([{ name: 'R. Menon' }]);   // name only
    await expect(promote_from_brief({
      brief_id: brief, named_index: 0, confirm_addressed: true,
    }, ctxFor(A))).rejects.toThrow(/R-C2|reachable channel/i);
  });

  it('writes the contact but leaves the journey where it was when NOT confirmed', async () => {
    const { prospect, brief } = await seedBrief([
      { name: 'R. Menon', email: 'r.menon@sriveda.example' },
    ]);
    const db = createTenantDb(pool, A);
    await moveByProspect(db, scope, prospect, 'qualified');
    const r = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    expect(r.journey_moved).toBe(false);

    const j = await findJourney(db, scope, prospect);
    expect(j!.state).toBe('qualified');
    // Wired onto the journey so the next screen shows a person, not a stranger.
    expect(j!.contact_id).toBe(r.contact_id);
  });

  it('cannot rewind a journey that has already been contacted', async () => {
    // R-J5/R7 through moveByProspect: an idempotent re-promotion of the
    // same brief after a send must not drag the journey back to addressed.
    const { prospect, brief } = await seedBrief([
      { name: 'R. Menon', email: 'r.menon@sriveda.example' },
    ]);
    const db = createTenantDb(pool, A);
    await ensureJourney(db, scope, prospect);
    await moveByProspect(db, scope, prospect, 'waiting');    // already sent

    const r = await promote_from_brief({
      brief_id: brief, named_index: 0, confirm_addressed: true,
    }, ctxFor(A));
    expect(r.journey_moved).toBe(false);
    const j = await findJourney(db, scope, prospect);
    expect(j!.state).toBe('waiting');
  });
});

/* ── list_brief_contacts — the read side ──────────────────────────────── */

d('list_brief_contacts', () => {
  it('marks each entry as addressable, promoted, or neither', async () => {
    const { brief } = await seedBrief([
      { name: 'R. Menon', email: 'r.menon@sriveda.example' },
      { name: 'S. Rao' },                          // no channel
      { email: 'x@sriveda.example' },              // no name
    ]);
    const before = await list_brief_contacts({ brief_id: brief }, ctxFor(A));
    expect(before.entries).toHaveLength(3);
    expect(before.entries[0]).toMatchObject({ has_name: true, has_channel: true, addressable: true, promoted_contact_id: null });
    expect(before.entries[1]).toMatchObject({ has_name: true, has_channel: false, addressable: false });
    expect(before.entries[2]).toMatchObject({ has_name: false, addressable: false });
    expect(before.entries[0].source_url).toBe('https://sriveda.example');

    const p = await promote_from_brief({ brief_id: brief, named_index: 0 }, ctxFor(A));
    const after = await list_brief_contacts({ brief_id: brief }, ctxFor(A));
    expect(after.entries[0].promoted_contact_id).toBe(p.contact_id);
    expect(after.entries[1].promoted_contact_id).toBeNull();
  });
});

/* ── The 3-check pattern ──────────────────────────────────────────────── */

d('tenant isolation', () => {
  it('valid data: the brief comes back for its own tenant', async () => {
    const { brief } = await seedBrief([{ name: 'R. Menon', email: 'r@x.example' }]);
    const r = await list_brief_contacts({ brief_id: brief }, ctxFor(A));
    expect(r.entries).toHaveLength(1);
  });

  it('empty: an unknown id looks like anyone else unknown id', async () => {
    await expect(list_brief_contacts({ brief_id: 9_999_999 }, ctxFor(A)))
      .rejects.toThrow(/No such brief/);
  });

  it('wrong tenant: another tenant brief is unreachable and unpromotable', async () => {
    const mine = await seedBrief([{ name: 'R. Menon', email: 'r@x.example' }], A);
    await expect(list_brief_contacts({ brief_id: mine.brief }, ctxFor(B)))
      .rejects.toThrow(/No such brief/);
    await expect(promote_from_brief({ brief_id: mine.brief, named_index: 0 }, ctxFor(B)))
      .rejects.toThrow(/No such brief/);
    const n = await pool.query(
      `SELECT count(*)::int n FROM gt_contacts WHERE brief_id = $1`, [mine.brief]);
    expect(n.rows[0].n).toBe(0);
  });
});
