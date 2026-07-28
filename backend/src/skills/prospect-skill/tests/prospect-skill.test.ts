/**
 * prospect-skill against a real PostgreSQL.
 *
 * Includes the 3-check pattern CLAUDE.md rule 7 requires — valid data / empty
 * / WRONG TENANT returns 0 rows — which is the check that matters most here,
 * because this skill reads a table the ETL fills in bulk.
 *
 * Skips without a database (see landing.test.ts for how to start one).
 */

import { Pool } from 'pg';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { get_records } from '../functions/get-records';
import { tag_prospects } from '../functions/tag-prospects';
import { build_cohort } from '../functions/build-cohort';

const A = '11111111-1111-1111-1111-111111111111';   // our tenant
const B = '33333333-3333-3333-3333-333333333333';   // someone else's
const USER = '22222222-2222-2222-2222-222222222222';
const C = '66666666-6666-6666-6666-666666666666';   // cohort fixtures
const D = '44444444-4444-4444-4444-444444444444';   // a tenant with no data

const MIGRATIONS = path.resolve(__dirname, '../../../../migrations');

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

let pool: Pool;

/** A SkillContext backed by the real pool, matching the shape functions use. */
function ctxFor(tenantId: string, isAdmin = false) {
  return {
    tenant_id: tenantId,
    is_live: false,
    user_id: USER,
    is_admin: isAdmin,
    db: {
      query: (sql: string, params: Record<string, unknown> = {}) => {
        // Mirror translateParams: named -> positional, in first-seen order.
        const order: string[] = [];
        const text = sql.replace(/\$([a-z_][a-z0-9_]*)/gi, (_m, name) => {
          if (!(`$${name}` in params)) throw new Error(`Missing param $${name}`);
          let i = order.indexOf(name);
          if (i === -1) { order.push(name); i = order.length - 1; }
          return `$${i + 1}`;
        });
        return pool.query(text, order.map((n) => params[`$${n}`]));
      },
      transaction: async (fn: (tx: any) => Promise<any>) => {
        const c = await pool.connect();
        try {
          await c.query('BEGIN');
          const tx = {
            query: (sql: string, params: Record<string, unknown> = {}) => {
              const order: string[] = [];
              const text = sql.replace(/\$([a-z_][a-z0-9_]*)/gi, (_m, name) => {
                if (!(`$${name}` in params)) throw new Error(`Missing param $${name}`);
                let i = order.indexOf(name);
                if (i === -1) { order.push(name); i = order.length - 1; }
                return `$${i + 1}`;
              });
              return c.query(text, order.map((n) => params[`$${n}`]));
            },
          };
          const out = await fn(tx);
          await c.query('COMMIT');
          return out;
        } catch (e) { await c.query('ROLLBACK'); throw e; }
        finally { c.release(); }
      },
    },
  } as any;
}

const BASE = `
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false);
CREATE TABLE gt_universe_company_sources (id BIGSERIAL PRIMARY KEY,
  source_id SMALLINT, load_id BIGINT, source_record_id VARCHAR(200) NOT NULL,
  company_id BIGINT, name VARCHAR(300) NOT NULL, domain_normalized VARCHAR(255),
  website VARCHAR(500), email VARCHAR(320), phone VARCHAR(120), address_line TEXT,
  city VARCHAR(120), state_code VARCHAR(8), pin VARCHAR(12), country VARCHAR(80),
  industry_raw TEXT, industry_id INTEGER, employees_band VARCHAR(40),
  revenue_band VARCHAR(40), linkedin_url VARCHAR(500), year_founded SMALLINT,
  description TEXT, raw JSONB DEFAULT '{}'::jsonb, source_as_of DATE,
  completeness NUMERIC(4,3), validity NUMERIC(4,3),
  field_quality JSONB DEFAULT '{}'::jsonb, blocking_key TEXT,
  ingested_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE gt_industries (id SERIAL PRIMARY KEY, code VARCHAR(80) UNIQUE, name VARCHAR(160));
CREATE TABLE gt_data_sources (id SMALLSERIAL PRIMARY KEY, code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(120) NOT NULL, kind VARCHAR(20) NOT NULL DEFAULT 'upload', tier SMALLINT DEFAULT 50);
CREATE TABLE gt_source_loads (id BIGSERIAL PRIMARY KEY,
  source_id SMALLINT NOT NULL REFERENCES gt_data_sources(id), label VARCHAR(160) NOT NULL,
  region VARCHAR(120), state_code VARCHAR(8), as_of DATE, default_industry_id INTEGER,
  tier_override SMALLINT, tenant_id UUID REFERENCES vn_tenants(id) ON DELETE CASCADE,
  file_checksum VARCHAR(64), row_count INTEGER, status VARCHAR(20) NOT NULL DEFAULT 'active',
  loaded_by UUID, loaded_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_prospects (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
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
  raw JSONB NOT NULL DEFAULT '{}'::jsonb, completeness NUMERIC(4,3), validity NUMERIC(4,3),
  source_as_of DATE, status VARCHAR(20) NOT NULL DEFAULT 'new', score INTEGER NOT NULL DEFAULT 0,
  score_reasons JSONB NOT NULL DEFAULT '{}'::jsonb, adopted_at TIMESTAMPTZ, created_by UUID,
  relationship VARCHAR(16) NOT NULL DEFAULT 'prospect',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE gt_contacts (id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live BOOLEAN NOT NULL DEFAULT false, is_active BOOLEAN NOT NULL DEFAULT true,
  name VARCHAR(255) NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
`;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS prospect_test');
  await admin.query('CREATE DATABASE prospect_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'prospect_test' });

  await pool.query(BASE);
  // Real migration files, so the tag tables are the ones that will ship.
  for (const m of ['199_gt_tags.sql', '203_record_tags.sql', '205_gt_record_view_active.sql',
                   '206_prospect_industry_canonical.sql']) {
    await pool.query(fs.readFileSync(path.join(MIGRATIONS, m), 'utf8'));
  }

  await pool.query(`INSERT INTO vn_tenants (id,name) VALUES ($1,'Us'),($2,'Them')`, [A, B]);
  await pool.query(`INSERT INTO gt_data_sources (code,name) VALUES ('upload','Upload')`);
  await pool.query(
    `INSERT INTO gt_source_loads (id,source_id,label,as_of,tenant_id)
     VALUES (1,1,'FTCCI Telangana','2023-10-26',$1)`, [A]);

  // Our tenant: two sharing a domain (must be flagged, never merged), one
  // customer, one with a rejected field.
  await pool.query(
    `INSERT INTO gt_prospects
       (tenant_id,is_live,ref,load_id,name,domain_normalized,city,industry_raw,
        completeness,validity,source_as_of,relationship)
     VALUES
       ($1,false,'PROS-0001',1,'Acme Industries','acme.com','Hyderabad','Manufacturers',0.800,1.000,'2023-10-26','prospect'),
       ($1,false,'PROS-0002',1,'Acme Logistics','acme.com','Secunderabad','Logistics',0.600,1.000,'2023-10-26','prospect'),
       ($1,false,'PROS-0003',1,'Beta Corp','beta.com','Bengaluru','IT Services',0.900,0.777,'2023-10-26','customer'),
       ($1,false,'PROS-0004',1,'Gamma Ltd',NULL,'Chennai',NULL,0.300,1.000,NULL,'prospect')`,
    [A]);

  // Another tenant's record — must never appear in our results.
  await pool.query(
    `INSERT INTO gt_prospects (tenant_id,is_live,ref,name,domain_normalized,completeness,validity)
     VALUES ($1,false,'PROS-0001','Someone Elses Co','other.com',1.0,1.0)`, [B]);

  // Common pool: two rows sharing a blocking key, neither resolved into a
  // golden record — because the merge engine does not exist yet.
  await pool.query(
    `INSERT INTO gt_universe_company_sources
       (source_id,load_id,source_record_id,name,domain_normalized,city,
        completeness,validity,source_as_of,blocking_key)
     VALUES
       (1,1,'A-3','Pool Alpha','alpha.com','Hyderabad',0.7,1.0,'2023-10-26','d:alpha.com'),
       (1,1,'A-4','Pool Alpha Divisions','alpha.com','Hyderabad',0.5,1.0,'2023-10-26','d:alpha.com'),
       (1,1,'A-5','Pool Beta','beta.com','Warangal',0.9,0.8,'2023-10-26','d:beta.com')`,
  );

  await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (10,$1,'Shortlist')`, [A]);
  await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (11,NULL,'FTCCI Telangana')`);
  await pool.query(`INSERT INTO gt_load_tags (load_id,tag_id) VALUES (1,11)`);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

const maybe = available ? describe : describe.skip;

maybe('get_prospects', () => {
  it('returns this tenant\'s records with quality and provenance', async () => {
    const r = await get_records({ scope: 'mine' }, ctxFor(A));
    expect((r.stats as any).total).toBe(4);
    const acme = r.records.find((p: any) => p.ref === 'PROS-0001')!;
    expect(acme.name).toBe('Acme Industries');
    expect(acme.completeness).toBe('0.800');
    expect(acme.source_label).toBe('FTCCI Telangana');
  });

  // CLAUDE.md rule 7, check 3 — the one that matters.
  it('returns 0 rows for another tenant', async () => {
    const r = await get_records({ scope: 'mine' }, ctxFor(B));
    expect(r.records.every((p: any) => p.name !== 'Acme Industries')).toBe(true);
    expect((r.stats as any).total).toBe(1);   // only their own row
  });

  it('returns empty rather than erroring when there is nothing', async () => {
    const r = await get_records({ scope: 'mine', search: 'nothing matches this' }, ctxFor(A));
    expect(r.records).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('bands freshness from the source date, and says unknown when undated', async () => {
    const r = await get_records({ scope: 'mine' }, ctxFor(A));
    // The FTCCI file is dated Oct 2023 — inside the 36-month band, which is
    // the 0.6 weight the design note gives it. Not yet 'stale'.
    expect(r.records.find((p: any) => p.ref === 'PROS-0001')!.freshness).toBe('ageing');
    expect(r.records.find((p: any) => p.ref === 'PROS-0004')!.freshness).toBe('unknown');
  });

  it('flags records sharing a domain WITHOUT merging them', async () => {
    const r = await get_records({ scope: 'mine', only_duplicates: true }, ctxFor(A));
    expect(r.total).toBe(2);
    expect(r.records.map((p: any) => p.name).sort()).toEqual(['Acme Industries', 'Acme Logistics']);
    // Both still exist as separate records — group companies are not one company.
    expect(r.records.every((p: any) => p.duplicate)).toBe(true);
  });

  it('filters by what the tenant declared the data to be', async () => {
    const r = await get_records({ scope: 'mine', relationship: 'customer' }, ctxFor(A));
    expect(r.total).toBe(1);
    expect(r.records[0].name).toBe('Beta Corp');
  });

  it('filters on completeness', async () => {
    const r = await get_records({ scope: 'mine', min_quality: 0.8 }, ctxFor(A));
    expect(r.records.map((p: any) => p.ref).sort()).toEqual(['PROS-0001', 'PROS-0003']);
  });

  it('shows the delivery tag as inherited on every record from that load', async () => {
    const r = await get_records({ scope: 'mine' }, ctxFor(A));
    const acme = r.records.find((p: any) => p.ref === 'PROS-0001')!;
    expect(acme.tags).toEqual([{ id: 11, label: 'FTCCI Telangana', inherited: true }]);
  });

  it('finds records by an inherited tag, not just a direct one', async () => {
    const r = await get_records({ scope: 'mine', tag_id: 11 }, ctxFor(A));
    expect(r.total).toBe(4);   // every record from that load
  });
});

maybe('filters, paging and active state', () => {
  it('filters by industry, from a value the facets actually offer', async () => {
    const r = await get_records({ scope: 'mine', industry: 'IT Services' }, ctxFor(A));
    expect(r.total).toBe(1);
    expect((r.records[0] as any).name).toBe('Beta Corp');
  });

  it('offers only industries that match more than one record', async () => {
    // The tail is 2,050 values seen once. A dropdown of those is a list, not
    // a filter — search covers them.
    const r = await get_records({ scope: 'mine' }, ctxFor(A));
    const values = ((r as any).facets.industries as { value: string }[]).map((i) => i.value);
    expect(values).not.toContain('IT Services');   // appears once
  });

  it('splits records by whether they can be reached at all', async () => {
    const has  = await get_records({ scope: 'mine', domain: 'has' },  ctxFor(A));
    const none = await get_records({ scope: 'mine', domain: 'none' }, ctxFor(A));
    expect(has.total).toBe(3);
    expect(none.total).toBe(1);            // Gamma Ltd has no domain
    expect(has.total + none.total).toBe(4);
  });

  it('matches a domain substring', async () => {
    const r = await get_records({ scope: 'mine', domain: 'acme' }, ctxFor(A));
    expect(r.total).toBe(2);
  });

  it('hides deactivated records, and can show them on request', async () => {
    await pool.query(`UPDATE gt_prospects SET is_active = false WHERE ref = 'PROS-0004'`);
    const hidden = await get_records({ scope: 'mine' }, ctxFor(A));
    expect(hidden.total).toBe(3);

    const shown = await get_records({ scope: 'mine', show_inactive: true }, ctxFor(A));
    expect(shown.total).toBe(4);
    expect((shown.records.find((r: any) => r.ref === 'PROS-0004') as any).is_active).toBe(false);

    await pool.query(`UPDATE gt_prospects SET is_active = true WHERE ref = 'PROS-0004'`);
  });

  it('pages without losing or repeating a record', async () => {
    const p1 = await get_records({ scope: 'mine', page: 1, limit: 2 }, ctxFor(A));
    const p2 = await get_records({ scope: 'mine', page: 2, limit: 2 }, ctxFor(A));

    expect(p1.records).toHaveLength(2);
    expect(p2.records).toHaveLength(2);
    // total is the FILTERED total, not the page size.
    expect(p1.total).toBe(4);

    const ids = [...p1.records, ...p2.records].map((r: any) => r.id);
    expect(new Set(ids).size).toBe(4);   // no overlap between pages
  });

  it('keeps the tenant filter on every page', async () => {
    const r = await get_records({ scope: 'mine', page: 1, limit: 100 }, ctxFor(B));
    expect(r.records.every((x: any) => x.name !== 'Acme Industries')).toBe(true);
  });
});

maybe('tag_prospects', () => {
  it('applies a direct tag and shows it alongside the inherited one', async () => {
    const applied = await tag_prospects({ prospect_ids: [1, 2], tag_id: 10 }, ctxFor(A));
    expect(applied.applied).toBe(2);

    const r = await get_records({ scope: 'mine', tag_id: 10 }, ctxFor(A));
    expect(r.total).toBe(2);
    const labels = (r.records[0] as any).tags.map((t: any) => `${t.label}:${t.inherited}`).sort();
    expect(labels).toEqual(['FTCCI Telangana:true', 'Shortlist:false']);
  });

  it('is idempotent — tagging twice does not double up', async () => {
    const again = await tag_prospects({ prospect_ids: [1, 2], tag_id: 10 }, ctxFor(A));
    expect(again.applied).toBe(0);
  });

  it('removes a direct tag', async () => {
    const r = await tag_prospects({ prospect_ids: [2], tag_id: 10, apply: false }, ctxFor(A));
    expect(r.removed).toBe(1);
  });

  it('refuses a tag belonging to another tenant', async () => {
    await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (12,$1,'Theirs')`, [B]);
    await expect(tag_prospects({ prospect_ids: [1], tag_id: 12 }, ctxFor(A)))
      .rejects.toThrow(/another tenant/i);
  });

  it('cannot tag another tenant\'s records even with a valid tag', async () => {
    const theirs = await pool.query(`SELECT id FROM gt_prospects WHERE tenant_id = $1`, [B]);
    const r = await tag_prospects(
      { prospect_ids: [Number(theirs.rows[0].id)], tag_id: 10 }, ctxFor(A));
    expect(r.applied).toBe(0);   // the filter is the authorisation
  });
});

maybe('get_universe_companies — the common pool', () => {
  it('refuses a non-admin tenant', async () => {
    // The pool table has no tenant_id, so nothing in the query constrains
    // who sees it. The gate is the whole protection.
    await expect(get_records({ scope: 'pool' }, ctxFor(A)))
      .rejects.toThrow(/admin tenants only/i);
  });

  it('serves an admin tenant', async () => {
    const r = await get_records({ scope: 'pool' }, ctxFor(B, true));
    expect((r.stats as any).total).toBe(3);
    expect(r.records.map((c: any) => c.name).sort())
      .toEqual(['Pool Alpha', 'Pool Alpha Divisions', 'Pool Beta']);
  });

  it('reports that nothing has been merged, rather than implying it has', async () => {
    const r = await get_records({ scope: 'pool' }, ctxFor(B, true));
    expect((r.stats as any).resolved).toBe(0);
    expect(r.records.every((c: any) => c.resolved === false)).toBe(true);
  });

  it('flags rows sharing a blocking key without merging them', async () => {
    const r = await get_records({ scope: 'pool', only_duplicates: true }, ctxFor(B, true));
    expect(r.records.map((c: any) => c.name).sort())
      .toEqual(['Pool Alpha', 'Pool Alpha Divisions']);
    expect(r.total).toBe(2);
  });

  it('carries the delivery tag onto pool rows', async () => {
    const r = await get_records({ scope: 'pool', search: 'Pool Beta' }, ctxFor(B, true));
    expect((r.records[0] as any).tags).toEqual([{ id: 11, label: 'FTCCI Telangana', inherited: true }]);
  });

  it('reports quality as components, same as the tenant side', async () => {
    const r = await get_records({ scope: 'pool' }, ctxFor(B, true));
    expect(Number((r.stats as any).avg_validity)).toBeLessThan(1);
    expect((r.stats as any).with_rejected_fields).toBe(1);
  });
});

maybe('get_prospect_stats', () => {
  it('reports fill rate and validity separately, never blended', async () => {
    const { stats } = await get_records({ scope: 'mine' }, ctxFor(A));
    expect((stats as any).total).toBe(4);
    expect((stats as any).customers).toBe(1);
    expect((stats as any).duplicates).toBe(2);
    // Beta Corp is fully populated but has a field that failed validation —
    // the case a single "quality score" would hide.
    expect((stats as any).with_rejected_fields).toBe(1);
    expect(Number((stats as any).avg_completeness)).toBeGreaterThan(0);
    expect(Number((stats as any).avg_validity)).toBeLessThan(1);
  });

  it('counts duplicates and undated records', async () => {
    const { stats } = await get_records({ scope: 'mine' }, ctxFor(A));
    expect((stats as any).duplicates).toBe(2);
    expect((stats as any).undated).toBe(1);
    // Nothing is past 36 months yet, so 'stale' is empty while 'fresh'
    // (≤18mo) is too — the FTCCI rows sit in the band between.
    expect((stats as any).with_domain).toBe(3);
  });

  it('is zero for a tenant with no records', async () => {
    const { stats } = await get_records({ scope: 'mine' }, ctxFor('44444444-4444-4444-4444-444444444444'));
    expect((stats as any).total).toBe(0);
  });
});

maybe('build_cohort — Step 1 of the manufacturing pilot', () => {
  // Its own tenant, so the counts here cannot be disturbed by, or disturb,
  // the fixtures every other block above asserts against.
  beforeAll(async () => {
    await pool.query(`INSERT INTO vn_tenants (id,name) VALUES ($1,'Cohort')`, [C]);
    await pool.query(
      `INSERT INTO gt_prospects (tenant_id,is_live,ref,name,domain_normalized,industry_raw)
       VALUES
         ($1,false,'C-0001','Alpha Steel','alphasteel.com','Manufacturers'),
         ($1,false,'C-0002','Beta Pharma','betapharma.com','Manufacturer'),
         ($1,false,'C-0003','Gamma Mills',NULL,'Manufacturing & Trading'),
         ($1,false,'C-0004','Delta Tools','deltatools.com','MFG'),
         ($1,false,'C-0005','Telangana Mfrs Association','tma.org','Manufacturers Association'),
         ($1,false,'C-0006','Zeta Hotels','zeta.com','Hotels & Restaurants'),
         ($1,false,'C-0007','Eta Traders',NULL,NULL),
         ($1,false,'C-0008','Theta Closed','theta.com','Manufacturers')`,
      [C]);
    // A deactivated manufacturer: real in the table, not in the cohort.
    await pool.query(`UPDATE gt_prospects SET is_active = false WHERE ref = 'C-0008'`);
  });

  it('rejects a cluster it has no rules for, naming the ones it has', async () => {
    await expect(build_cohort({ cluster: 'aerospace' }, ctxFor(C)))
      .rejects.toThrow(/manufacturing/);
  });

  it('classifies without writing when asked to dry run', async () => {
    const r = await build_cohort({ cluster: 'manufacturing', dry_run: true }, ctxFor(C));

    expect(r.dry_run).toBe(true);
    expect(r.scanned).toBe(7);            // C-0008 is deactivated
    expect(r.matched).toBe(4);            // Manufacturers, Manufacturer, Manufacturing &, MFG
    expect(r.excluded).toBe(1);           // the association
    expect(r.no_rule).toBe(1);            // hotels
    expect(r.no_industry).toBe(1);        // Eta Traders

    const written = await pool.query(
      `SELECT count(*)::int AS n FROM gt_prospects
       WHERE tenant_id = $1 AND industry_canonical IS NOT NULL`, [C]);
    expect(written.rows[0].n).toBe(0);
  });

  it('reports the size the pilot is actually planned on', async () => {
    const r = await build_cohort({ cluster: 'manufacturing', dry_run: true }, ctxFor(C));
    // Only rows with a domain can be researched — Gamma Mills cannot.
    expect(r.with_domain).toBe(3);
    expect(r.without_domain).toBe(1);
    expect(r.with_domain + r.without_domain).toBe(r.matched);
  });

  it('shows which raw strings collapsed, so the rule can be checked', async () => {
    const r = await build_cohort({ cluster: 'manufacturing', dry_run: true }, ctxFor(C));
    expect(r.variants.map((v) => v.industry_raw).sort())
      .toEqual(['MFG', 'Manufacturer', 'Manufacturers', 'Manufacturing & Trading']);
  });

  it('reports what it excluded rather than dropping it silently', async () => {
    const r = await build_cohort({ cluster: 'manufacturing', dry_run: true }, ctxFor(C));
    expect(r.excluded_samples).toEqual([
      { industry_raw: 'Manufacturers Association', excluded_by: 'association', rows: 1 },
    ]);
  });

  it('writes the collapsed value and tags the cohort', async () => {
    const r = await build_cohort(
      { cluster: 'manufacturing', tag_label: 'Pilot Manufacturing' }, ctxFor(C));

    expect(r.dry_run).toBe(false);
    expect(r.matched).toBe(4);
    expect(r.tagged).toBe(4);
    expect(r.tag!.label).toBe('Pilot Manufacturing');

    const rows = await pool.query(
      `SELECT ref, industry_raw FROM gt_prospects
       WHERE tenant_id = $1 AND industry_canonical = 'manufacturing' ORDER BY ref`, [C]);
    expect(rows.rows.map((x: any) => x.ref)).toEqual(['C-0001', 'C-0002', 'C-0003', 'C-0004']);

    // The source string is provenance and is never rewritten.
    expect(rows.rows[0].industry_raw).toBe('Manufacturers');
  });

  it('selects the whole cohort through the tag, from the normal list query', async () => {
    const built = await build_cohort(
      { cluster: 'manufacturing', tag_label: 'Pilot Manufacturing' }, ctxFor(C));
    const listed = await get_records({ scope: 'mine', tag_id: built.tag!.id }, ctxFor(C));
    expect(listed.total).toBe(4);
  });

  it('is idempotent — a second run tags nothing new', async () => {
    const again = await build_cohort(
      { cluster: 'manufacturing', tag_label: 'Pilot Manufacturing' }, ctxFor(C));
    expect(again.matched).toBe(4);
    expect(again.tagged).toBe(0);
    expect(again.tagged_no_longer_matching).toBe(0);
  });

  it('surfaces a stale tag instead of revoking a human-visible assertion', async () => {
    const first = await build_cohort(
      { cluster: 'manufacturing', tag_label: 'Pilot Manufacturing' }, ctxFor(C));

    // Someone hand-tags a record the rule never claimed.
    const hotel = await pool.query(
      `SELECT id FROM gt_prospects WHERE tenant_id = $1 AND ref = 'C-0006'`, [C]);
    await tag_prospects(
      { prospect_ids: [Number(hotel.rows[0].id)], tag_id: first.tag!.id }, ctxFor(C));

    const r = await build_cohort(
      { cluster: 'manufacturing', tag_label: 'Pilot Manufacturing' }, ctxFor(C));
    expect(r.tagged_no_longer_matching).toBe(1);

    // Still tagged. The rule reports, the human decides.
    const still = await pool.query(
      `SELECT count(*)::int AS n FROM gt_prospect_tags
       WHERE tag_id = $1 AND prospect_id = $2`, [first.tag!.id, hotel.rows[0].id]);
    expect(still.rows[0].n).toBe(1);

    await tag_prospects(
      { prospect_ids: [Number(hotel.rows[0].id)], tag_id: first.tag!.id, apply: false }, ctxFor(C));
  });

  it('clears a derived value the rule no longer claims', async () => {
    // industry_canonical is derived, not asserted — unlike a tag, it must
    // not survive a row that stopped matching.
    await pool.query(
      `UPDATE gt_prospects SET industry_raw = 'Hotels' WHERE tenant_id = $1 AND ref = 'C-0004'`, [C]);

    const r = await build_cohort({ cluster: 'manufacturing' }, ctxFor(C));
    expect(r.matched).toBe(3);

    const left = await pool.query(
      `SELECT industry_canonical FROM gt_prospects WHERE tenant_id = $1 AND ref = 'C-0004'`, [C]);
    expect(left.rows[0].industry_canonical).toBeNull();

    await pool.query(
      `UPDATE gt_prospects SET industry_raw = 'MFG' WHERE tenant_id = $1 AND ref = 'C-0004'`, [C]);
  });

  // CLAUDE.md rule 7, check 3.
  it('never touches another tenant\'s records', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM gt_prospects
       WHERE tenant_id = $1 AND industry_canonical IS NOT NULL`, [C]);

    const r = await build_cohort({ cluster: 'manufacturing' }, ctxFor(B));
    expect(r.matched).toBe(0);          // B's only row carries no industry

    const after = await pool.query(
      `SELECT count(*)::int AS n FROM gt_prospects
       WHERE tenant_id = $1 AND industry_canonical IS NOT NULL`, [C]);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  // CLAUDE.md rule 7, check 2.
  it('returns an empty report rather than erroring for a tenant with nothing', async () => {
    const r = await build_cohort({ cluster: 'manufacturing' }, ctxFor(D));
    expect(r.scanned).toBe(0);
    expect(r.matched).toBe(0);
    expect(r.variants).toEqual([]);
    expect(r.tag).toBeNull();
  });
});
