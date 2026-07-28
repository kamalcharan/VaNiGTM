/**
 * Integration test for the landing step, against a REAL PostgreSQL.
 *
 * Unit tests could not have caught the two defects that reached the user
 * (a column no migration creates, a CHECK that rejects 'company') because
 * both live in the gap between the code's assumptions and the schema. So this
 * builds the schema from the actual migration files and runs the real
 * landSession against it.
 *
 * Skips when no database is reachable, so `npm test` still passes on a
 * machine without one. To run it:
 *
 *   su postgres -c "/usr/lib/postgresql/16/bin/pg_ctl -D /tmp/pg/data \
 *     -o '-p 55432 -k /tmp' -l /tmp/pg/log start"
 *   PGHOST=/tmp PGPORT=55432 PGUSER=postgres npx jest landing
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { landSession, freshnessWeight, buildFieldDiff } from '../landing';

const TENANT = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const AUTH = { tenant_id: TENANT, is_live: false, user_id: USER };

const MIGRATIONS = path.resolve(__dirname, '../../../migrations');

/** Everything landing.ts touches, at its pre-198 shape. */
const BASE_SCHEMA = `
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $fn$ LANGUAGE plpgsql;

CREATE TABLE vn_tenants (id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL);

CREATE TABLE gt_seq_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  sequence_type TEXT NOT NULL, prefix TEXT NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0, pad_width INTEGER NOT NULL DEFAULT 4,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gt_seq_counters_tenant_type UNIQUE (tenant_id, sequence_type));

CREATE OR REPLACE FUNCTION gt_next_seq(p_tenant_id UUID, p_type TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $fn$
DECLARE v_prefix TEXT; v_next INTEGER; v_pad INTEGER;
BEGIN
  INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
  VALUES (p_tenant_id, p_type, UPPER(LEFT(p_type,4)))
  ON CONFLICT (tenant_id, sequence_type) DO NOTHING;
  UPDATE gt_seq_counters SET last_value = last_value + 1, updated_at = now()
  WHERE tenant_id = p_tenant_id AND sequence_type = p_type
  RETURNING prefix, last_value, pad_width INTO v_prefix, v_next, v_pad;
  RETURN v_prefix || '-' || LPAD(v_next::TEXT, v_pad, '0');
END; $fn$;

CREATE TABLE gt_industries (id SERIAL PRIMARY KEY, code VARCHAR(80) UNIQUE, name VARCHAR(160));
CREATE TABLE gt_data_sources (id SMALLSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'upload', tier SMALLINT NOT NULL DEFAULT 50);
CREATE TABLE gt_source_loads (
  id BIGSERIAL PRIMARY KEY, source_id SMALLINT NOT NULL REFERENCES gt_data_sources(id),
  label VARCHAR(160) NOT NULL, region VARCHAR(120), state_code VARCHAR(8), as_of DATE,
  default_industry_id INTEGER REFERENCES gt_industries(id), tier_override SMALLINT,
  tenant_id UUID REFERENCES vn_tenants(id) ON DELETE CASCADE,
  file_checksum VARCHAR(64), row_count INTEGER, status VARCHAR(20) NOT NULL DEFAULT 'active',
  loaded_by UUID, loaded_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE gt_contacts (
  id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  prefix VARCHAR(20), name VARCHAR(255) NOT NULL,
  normalized_name TEXT GENERATED ALWAYS AS (UPPER(REGEXP_REPLACE(REGEXP_REPLACE(
    REGEXP_REPLACE(REGEXP_REPLACE(name,'^(MR|MRS|MS|DR|PROF|SRI|SMT)\\.?\\s+','','i'),
    '[^A-Z0-9\\s]','','g'),'\\s+',' ','g'),'^\\s+|\\s+$','','g'))) STORED,
  job_title VARCHAR(200), company_name VARCHAR(255), company_domain VARCHAR(255),
  linkedin_url VARCHAR(500), location VARCHAR(200),
  source VARCHAR(40) NOT NULL DEFAULT 'manual', external_ref TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb, score INTEGER NOT NULL DEFAULT 0,
  prospect_id BIGINT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX idx_gt_contacts_normalized_name ON gt_contacts(tenant_id, is_live, normalized_name) WHERE is_active;

CREATE TABLE gt_contact_channels (
  id BIGSERIAL PRIMARY KEY, contact_id BIGINT NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL, is_live BOOLEAN NOT NULL DEFAULT false,
  channel_type VARCHAR(50) NOT NULL, channel_value VARCHAR(255) NOT NULL,
  channel_subtype VARCHAR(50) NOT NULL DEFAULT 'personal',
  is_primary BOOLEAN NOT NULL DEFAULT false, source VARCHAR(40) NOT NULL DEFAULT 'manual');

CREATE TABLE gt_prospects (
  id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  ref VARCHAR(24), load_id BIGINT REFERENCES gt_source_loads(id) ON DELETE SET NULL,
  universe_company_id BIGINT, source VARCHAR(40) NOT NULL DEFAULT 'upload', external_ref TEXT,
  name VARCHAR(300) NOT NULL,
  name_key TEXT GENERATED ALWAYS AS (BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(
    REGEXP_REPLACE(UPPER(name),'[^A-Z0-9 ]',' ','g'),
    '\\y(PVT|PRIVATE|LTD|LIMITED|LLP|INC|CO|COMPANY|THE)\\y',' ','g'),'\\s+',' ','g'))) STORED,
  domain_normalized VARCHAR(255), website VARCHAR(500), email VARCHAR(320), phone VARCHAR(120),
  address_line TEXT, city VARCHAR(120), state_code VARCHAR(8), pin VARCHAR(12), country VARCHAR(80),
  industry_id INTEGER, industry_raw TEXT, employees_band VARCHAR(40), revenue_band VARCHAR(40),
  linkedin_url VARCHAR(500), year_founded SMALLINT, description TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  completeness NUMERIC(4,3), validity NUMERIC(4,3), source_as_of DATE,
  status VARCHAR(20) NOT NULL DEFAULT 'new', score INTEGER NOT NULL DEFAULT 0,
  score_reasons JSONB NOT NULL DEFAULT '{}'::jsonb, adopted_at TIMESTAMPTZ, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());

CREATE TABLE gt_universe_company_sources (
  id BIGSERIAL PRIMARY KEY, source_id SMALLINT NOT NULL REFERENCES gt_data_sources(id),
  load_id BIGINT NOT NULL REFERENCES gt_source_loads(id) ON DELETE CASCADE,
  source_record_id VARCHAR(200) NOT NULL, company_id BIGINT, name VARCHAR(300) NOT NULL,
  domain_normalized VARCHAR(255), website VARCHAR(500), email VARCHAR(320), phone VARCHAR(120),
  address_line TEXT, city VARCHAR(120), state_code VARCHAR(8), pin VARCHAR(12), country VARCHAR(80),
  industry_raw TEXT, industry_id INTEGER, employees_band VARCHAR(40), revenue_band VARCHAR(40),
  linkedin_url VARCHAR(500), year_founded SMALLINT, description TEXT,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb, source_as_of DATE,
  completeness NUMERIC(4,3), validity NUMERIC(4,3), field_quality JSONB NOT NULL DEFAULT '{}'::jsonb,
  blocking_key TEXT, ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE (source_id, source_record_id));

CREATE TABLE gt_campaigns (id BIGSERIAL PRIMARY KEY, tenant_id UUID NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false, name VARCHAR(200) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'draft');
CREATE TABLE gt_contact_assignments (id BIGSERIAL PRIMARY KEY,
  contact_id BIGINT NOT NULL REFERENCES gt_contacts(id) ON DELETE CASCADE,
  campaign_id BIGINT NOT NULL REFERENCES gt_campaigns(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL, is_live BOOLEAN NOT NULL DEFAULT false,
  stage VARCHAR(20) NOT NULL DEFAULT 'identified');

CREATE TABLE ki_file_uploads (id SERIAL PRIMARY KEY, tenant_id UUID, file_type TEXT,
  original_filename TEXT, file_hash VARCHAR(64), processing_status TEXT DEFAULT 'pending');
CREATE TABLE ki_import_sessions (id SERIAL PRIMARY KEY, tenant_id UUID, file_upload_id INTEGER,
  import_type TEXT NOT NULL CHECK (import_type IN ('scheme','customer','transaction','bookmark')),
  status TEXT NOT NULL DEFAULT 'pending', total_records INTEGER NOT NULL DEFAULT 0,
  processed_records INTEGER NOT NULL DEFAULT 0, successful_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0, duplicate_records INTEGER NOT NULL DEFAULT 0,
  field_mappings JSONB, error_summary TEXT, created_by UUID,
  staging_completed_at TIMESTAMPTZ, processing_started_at TIMESTAMPTZ,
  processing_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  destination VARCHAR(24) NOT NULL DEFAULT 'prospects',
  load_id BIGINT REFERENCES gt_source_loads(id) ON DELETE SET NULL);
CREATE TABLE ki_import_staging (id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES ki_import_sessions(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL, raw_data JSONB NOT NULL, mapped_data JSONB,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','success','failed','duplicate','skipped','orphan')),
  error_messages TEXT[], warnings TEXT[], created_record_id TEXT, created_record_type TEXT,
  processed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(session_id, row_number),
  validity NUMERIC(4,3), completeness NUMERIC(4,3),
  reject_reasons JSONB NOT NULL DEFAULT '[]'::jsonb, dedup_key TEXT);
`;

let pool: Pool | null = null;

/**
 * Reachability is decided SYNCHRONOUSLY, at module load.
 *
 * describe.skip has to be chosen while the suite is being registered, which
 * happens before any beforeAll runs — a flag set in beforeAll is always still
 * false here, and every test silently skips while the run reports green.
 */
const available = (() => {
  try {
    execSync(
      `pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' },
    );
    return true;
  } catch {
    return false;
  }
})();

async function setup(): Promise<void> {
  const admin = new Pool({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432,
    user: process.env.PGUSER || 'postgres',
    database: 'postgres',
    connectionTimeoutMillis: 2000,
  });
  await admin.query('DROP DATABASE IF EXISTS landing_test');
  await admin.query('CREATE DATABASE landing_test');
  await admin.end();

  pool = new Pool({
    host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432,
    user: process.env.PGUSER || 'postgres',
    database: 'landing_test',
  });

  await pool.query(BASE_SCHEMA);
  // The real migration files — so this exercises them, not a paraphrase.
  for (const m of ['198_gt_contacts_provenance.sql', '199_gt_tags.sql',
                   '200_import_merge_review.sql', '201_ki_import_sessions_company_type.sql',
                   '202_source_load_checksum_guard.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }

  await pool.query(`INSERT INTO vn_tenants (id, name) VALUES ($1, 'Acme')`, [TENANT]);
  await pool.query(`INSERT INTO gt_data_sources (code, name) VALUES ('upload','Tenant upload')`);
}

// Deliberately NOT wrapped in try/catch: once the database is reachable, a
// schema failure is a real defect and must fail the run, not skip it.
beforeAll(async () => { if (available) await setup(); }, 60000);

afterAll(async () => { if (pool) await pool.end(); });

/** Stage a session with the given mapped rows and land it. */
async function stageAndLand(
  rows: any[],
  opts: { destination?: string; relationship?: string; asOf?: string | null } = {},
) {
  const load = await pool!.query(
    `INSERT INTO gt_source_loads (source_id, label, as_of, tenant_id, file_checksum)
     VALUES (1, 'test load', $1, $2, $3) RETURNING id`,
    [opts.asOf ?? '2023-10-26', opts.destination === 'universe_companies' ? null : TENANT,
     'sha' + Math.floor(performance.now() * 1000)],
  );
  const loadId = (load.rows[0] as any).id;

  const sess = await pool!.query(
    `INSERT INTO ki_import_sessions (tenant_id, import_type, status, destination, load_id, relationship)
     VALUES ($1,'company','staged',$2,$3,$4) RETURNING *`,
    [TENANT, opts.destination ?? 'prospects', loadId, opts.relationship ?? 'contacts'],
  );
  const session = sess.rows[0] as any;

  for (let i = 0; i < rows.length; i++) {
    await pool!.query(
      `INSERT INTO ki_import_staging
         (session_id, row_number, raw_data, mapped_data, completeness, validity, dedup_key)
       VALUES ($1,$2,'{}'::jsonb,$3::jsonb,0.8,1.0,$4)`,
      [session.id, i + 1, JSON.stringify(rows[i].mapped), rows[i].dedup_key ?? null],
    );
  }

  return landSession(pool!, session, AUTH);
}

const company = (over: any = {}) => ({
  name: 'Acme Industries', domain_normalized: 'acme.com', website: 'acme.com',
  email: 'info@acme.com', phone: '040-2323', address_line: '1 Main Rd',
  city: 'Hyderabad', state_code: 'TG', pin: '500003', country: 'India',
  industry_raw: 'Manufacturers', employees_band: '11-50', revenue_band: null,
  linkedin_url: null, year_founded: 1998, description: null, ...over,
});

const person = (over: any = {}) => ({
  prefix: null, name: 'Priya Sharma', job_title: 'Head of Ops',
  company_name: 'Acme Industries', company_domain: 'acme.com',
  linkedin_url: null, location: 'Hyderabad', email: 'priya@acme.com',
  mobile: '9876543210', ...over,
});

/* ── Pure functions: no database needed ──────────────────────────────── */

describe('freshnessWeight', () => {
  it('bands the decay, and treats undated as stale not current', () => {
    expect(freshnessWeight(new Date().toISOString())).toBe(1.0);
    expect(freshnessWeight('2023-10-26')).toBeLessThanOrEqual(0.6); // FTCCI, 33mo
    expect(freshnessWeight(null)).toBe(0.5);
  });
});

describe('buildFieldDiff', () => {
  it('says nothing changed when nothing changed', () => {
    expect(buildFieldDiff({ city: 'Hyderabad' }, { city: 'Hyderabad' }, ['city'], 1, 1)).toBeNull();
  });

  it('treats filling a hole as safe rather than as a clash', () => {
    const d = buildFieldDiff({ city: null }, { city: 'Hyderabad' }, ['city'], 0.5, 1)!;
    expect(d.city.recommended).toBe('take');
    expect(d.city.reason).toContain('Nothing recorded');
  });

  it('recommends the fresher side and explains why', () => {
    const stale = buildFieldDiff({ city: 'Secunderabad' }, { city: 'Hyderabad' }, ['city'], 1.0, 0.6)!;
    expect(stale.city.recommended).toBe('take');
    const fresh = buildFieldDiff({ city: 'Secunderabad' }, { city: 'Hyderabad' }, ['city'], 0.4, 1.0)!;
    expect(fresh.city.recommended).toBe('keep');
    expect(fresh.city.reason).toContain('already hold');
  });

  it('ignores a field the incoming row does not mention', () => {
    expect(buildFieldDiff({ city: 'Hyderabad' }, { city: null }, ['city'], 1, 1)).toBeNull();
  });
});

/* ── Integration: the real landing against a real database ───────────── */

const maybe = () => (available ? describe : describe.skip);

maybe()('landSession — a clean first import', () => {
  it('lands companies, people and channels, and asks nothing', async () => {
    const r = await stageAndLand([
      { mapped: { company: company(), people: [person()] }, dedup_key: 'd:acme.com' },
      {
        mapped: {
          company: company({ name: 'Beta Corp', domain_normalized: 'beta.com' }),
          people: [person({ name: 'Ramesh Kumar', company_domain: 'beta.com', email: 'r@beta.com' })],
        },
        dedup_key: 'd:beta.com',
      },
    ]);

    expect(r.successful).toBe(2);
    expect(r.conflict).toBe(0);
    expect(r.status).toBe('completed');
    expect(r.landed.companies).toBe(2);
    expect(r.landed.people).toBe(2);
    expect(r.landed.channels).toBe(4); // email + mobile each

    const p = await pool!.query(`SELECT ref, name, relationship, source_as_of FROM gt_prospects ORDER BY id`);
    expect(p.rows).toHaveLength(2);
    expect((p.rows[0] as any).ref).toMatch(/^PROS-\d{4}$/);   // never a raw PK
    expect((p.rows[0] as any).relationship).toBe('prospect');
    expect((p.rows[0] as any).source_as_of).toBeTruthy();     // freshness carried from the load

    const c = await pool!.query(`SELECT name, normalized_name, person_key, prospect_id FROM gt_contacts ORDER BY id`);
    expect((c.rows[0] as any).normalized_name).toBe('PRIYA SHARMA'); // 198 repair, end to end
    expect((c.rows[0] as any).person_key).toBe('PRIYA SHARMA|acme.com');
    expect((c.rows[0] as any).prospect_id).not.toBeNull();   // person linked to their company
  });

  it('marks a customers upload as customers, not prospects', async () => {
    await stageAndLand(
      [{ mapped: { company: company({ name: 'Gamma Ltd', domain_normalized: 'gamma.com' }), people: [] }, dedup_key: 'd:gamma.com' }],
      { relationship: 'customers' },
    );
    const r = await pool!.query(`SELECT relationship FROM gt_prospects WHERE name = 'Gamma Ltd'`);
    expect((r.rows[0] as any).relationship).toBe('customer');
  });
});

maybe()('landSession — repeats within one file', () => {
  it('lands the first and calls the identical second a duplicate, not a conflict', async () => {
    const r = await stageAndLand([
      { mapped: { company: company({ name: 'Delta Inc', domain_normalized: 'delta.com' }), people: [] }, dedup_key: 'd:delta.com' },
      { mapped: { company: company({ name: 'Delta Inc', domain_normalized: 'delta.com' }), people: [] }, dedup_key: 'd:delta.com' },
    ]);
    expect(r.successful).toBe(1);
    expect(r.duplicate).toBe(1);
    expect(r.conflict).toBe(0);   // nothing to decide — it says nothing new
  });
});

maybe()('landSession — clashing with what is already held', () => {
  it('holds the row instead of overwriting, and stores the per-field diff', async () => {
    await stageAndLand([
      { mapped: { company: company({ name: 'Epsilon', domain_normalized: 'eps.com', city: 'Hyderabad' }), people: [] }, dedup_key: 'd:eps.com' },
    ], { asOf: '2023-01-01' });

    // Same company, fresher file, different city.
    const r = await stageAndLand([
      { mapped: { company: company({ name: 'Epsilon', domain_normalized: 'eps.com', city: 'Bengaluru' }), people: [] }, dedup_key: 'd:eps.com' },
    ], { asOf: new Date().toISOString().slice(0, 10) });

    expect(r.conflict).toBe(1);
    expect(r.successful).toBe(0);
    expect(r.status).toBe('needs_review');

    // The held row must NOT have changed the stored record.
    const held = await pool!.query(`SELECT city FROM gt_prospects WHERE domain_normalized = 'eps.com'`);
    expect((held.rows[0] as any).city).toBe('Hyderabad');

    const s = await pool!.query(
      `SELECT field_diff, conflict_kind FROM ki_import_staging
       WHERE processing_status = 'conflict' ORDER BY id DESC LIMIT 1`,
    );
    const diff = (s.rows[0] as any).field_diff;
    expect((s.rows[0] as any).conflict_kind).toBe('existing');
    expect(diff.city.existing).toBe('Hyderabad');
    expect(diff.city.incoming).toBe('Bengaluru');
    expect(diff.city.recommended).toBe('take');   // the newer file is fresher
  });
});

maybe()('landSession — campaign safety', () => {
  it('flags a contact mid-campaign when the clash touches what a sequence sends to', async () => {
    await stageAndLand([
      { mapped: { company: null, people: [person({ name: 'Anita Rao', company_domain: 'zeta.com', linkedin_url: null })] }, dedup_key: null },
    ], { asOf: '2023-01-01' });

    const c = await pool!.query(`SELECT id FROM gt_contacts WHERE name = 'Anita Rao'`);
    const contactId = (c.rows[0] as any).id;

    const camp = await pool!.query(
      `INSERT INTO gt_campaigns (tenant_id, name, status) VALUES ($1,'Q3 outbound','active') RETURNING id`,
      [TENANT],
    );
    await pool!.query(
      `INSERT INTO gt_contact_assignments (contact_id, campaign_id, tenant_id, is_live, stage)
       VALUES ($1,$2,$3,false,'contacted')`,
      [contactId, (camp.rows[0] as any).id, TENANT],
    );

    // A fresher file changes their LinkedIn — a channel a sequence uses.
    const r = await stageAndLand([
      { mapped: { company: null, people: [person({ name: 'Anita Rao', company_domain: 'zeta.com', linkedin_url: 'https://linkedin.com/in/anita' })] }, dedup_key: null },
    ], { asOf: new Date().toISOString().slice(0, 10) });

    expect(r.conflict).toBe(1);
    expect(r.campaign_locked).toBe(1);

    const s = await pool!.query(
      `SELECT campaign_locked FROM ki_import_staging
       WHERE processing_status = 'conflict' ORDER BY id DESC LIMIT 1`,
    );
    expect((s.rows[0] as any).campaign_locked).toBe(true);
  });
});

maybe()('landSession — the common pool', () => {
  it('writes immutable source rows and re-ingests idempotently', async () => {
    const rows = [
      { mapped: { company: company({ name: 'Pool Co', domain_normalized: 'pool.com' }), people: [] }, dedup_key: 'd:pool.com' },
    ];
    const first = await stageAndLand(rows, { destination: 'universe_companies', relationship: 'dataset' });
    expect(first.landed.companies).toBe(1);

    const before = await pool!.query(`SELECT COUNT(*)::int n FROM gt_universe_company_sources`);
    await stageAndLand(rows, { destination: 'universe_companies', relationship: 'dataset' });
    const after = await pool!.query(`SELECT COUNT(*)::int n FROM gt_universe_company_sources`);

    // Same source record id -> updated in place, not duplicated.
    expect((after.rows[0] as any).n).toBe((before.rows[0] as any).n);
    expect((await pool!.query(`SELECT blocking_key FROM gt_universe_company_sources LIMIT 1`)).rows[0])
      .toHaveProperty('blocking_key', 'd:pool.com');
  });
});

maybe()('landSession — at the real file size', () => {
  // The FTCCI file is 2,913 rows. The landing issues statements per row, so
  // this is where a design that is fine for ten rows becomes a request that
  // hangs. Measured here so a regression shows up as a number, not as a user
  // watching a spinner.
  it('lands 2,913 rows', async () => {
    const rows = Array.from({ length: 2913 }, (_, i) => ({
      mapped: {
        company: company({ name: `Scale Co ${i}`, domain_normalized: `scale${i}.com` }),
        people: [person({ name: `Person ${i}`, company_domain: `scale${i}.com`, email: `p${i}@scale${i}.com` })],
      },
      dedup_key: `d:scale${i}.com`,
    }));

    const r = await stageAndLand(rows);

    expect(r.successful).toBe(2913);
    expect(r.landed.companies).toBe(2913);
    expect(r.landed.people).toBe(2913);
    expect(r.conflict).toBe(0);

    // Reported so the cost is visible in CI output rather than guessed at.
    // eslint-disable-next-line no-console
    console.log(`[scale] 2,913 rows landed in ${(r.duration_ms / 1000).toFixed(1)}s ` +
                `(${(r.duration_ms / 2913).toFixed(2)} ms/row)`);
  }, 180000);
});

maybe()('the checksum guard (migration 202)', () => {
  it('refuses a second active load of identical bytes', async () => {
    await pool!.query(
      `INSERT INTO gt_source_loads (source_id, label, tenant_id, file_checksum)
       VALUES (1,'first',$1,'deadbeef')`, [TENANT],
    );
    await expect(pool!.query(
      `INSERT INTO gt_source_loads (source_id, label, tenant_id, file_checksum)
       VALUES (1,'second',$1,'deadbeef')`, [TENANT],
    )).rejects.toThrow(/duplicate key|unique/i);
  });

  it('allows it again once the earlier load is retired', async () => {
    await pool!.query(`UPDATE gt_source_loads SET status='retired' WHERE file_checksum='deadbeef'`);
    await expect(pool!.query(
      `INSERT INTO gt_source_loads (source_id, label, tenant_id, file_checksum)
       VALUES (1,'third',$1,'deadbeef')`, [TENANT],
    )).resolves.toBeTruthy();
  });
});
