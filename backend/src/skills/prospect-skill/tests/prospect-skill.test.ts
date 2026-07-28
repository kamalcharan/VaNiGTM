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
import { get_prospects } from '../functions/get-prospects';
import { get_prospect_stats } from '../functions/get-prospect-stats';
import { tag_prospects } from '../functions/tag-prospects';

const A = '11111111-1111-1111-1111-111111111111';   // our tenant
const B = '33333333-3333-3333-3333-333333333333';   // someone else's
const USER = '22222222-2222-2222-2222-222222222222';

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
function ctxFor(tenantId: string) {
  return {
    tenant_id: tenantId,
    is_live: false,
    user_id: USER,
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
CREATE TABLE vn_tenants (id UUID PRIMARY KEY, name VARCHAR(200) NOT NULL);
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
  for (const m of ['199_gt_tags.sql', '203_record_tags.sql']) {
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

  await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (10,$1,'Shortlist')`, [A]);
  await pool.query(`INSERT INTO gt_tags (id,tenant_id,label) VALUES (11,NULL,'FTCCI Telangana')`);
  await pool.query(`INSERT INTO gt_load_tags (load_id,tag_id) VALUES (1,11)`);
}, 60000);

afterAll(async () => { if (pool) await pool.end(); });

const maybe = available ? describe : describe.skip;

maybe('get_prospects', () => {
  it('returns this tenant\'s records with quality and provenance', async () => {
    const r = await get_prospects({}, ctxFor(A));
    expect(r.total).toBe(4);
    const acme = r.prospects.find((p) => p.ref === 'PROS-0001')!;
    expect(acme.name).toBe('Acme Industries');
    expect(acme.completeness).toBe('0.800');
    expect(acme.load_label).toBe('FTCCI Telangana');
  });

  // CLAUDE.md rule 7, check 3 — the one that matters.
  it('returns 0 rows for another tenant', async () => {
    const r = await get_prospects({}, ctxFor(B));
    expect(r.prospects.every((p) => p.name !== 'Acme Industries')).toBe(true);
    expect(r.total).toBe(1);   // only their own row
  });

  it('returns empty rather than erroring when there is nothing', async () => {
    const r = await get_prospects({ search: 'nothing matches this' }, ctxFor(A));
    expect(r.prospects).toEqual([]);
    expect(r.total).toBe(0);
  });

  it('bands freshness from the source date, and says unknown when undated', async () => {
    const r = await get_prospects({}, ctxFor(A));
    // The FTCCI file is dated Oct 2023 — inside the 36-month band, which is
    // the 0.6 weight the design note gives it. Not yet 'stale'.
    expect(r.prospects.find((p) => p.ref === 'PROS-0001')!.freshness).toBe('ageing');
    expect(r.prospects.find((p) => p.ref === 'PROS-0004')!.freshness).toBe('unknown');
  });

  it('flags records sharing a domain WITHOUT merging them', async () => {
    const r = await get_prospects({ only_duplicates: true }, ctxFor(A));
    expect(r.total).toBe(2);
    expect(r.prospects.map((p) => p.name).sort()).toEqual(['Acme Industries', 'Acme Logistics']);
    // Both still exist as separate records — group companies are not one company.
    expect(r.prospects.every((p) => p.shares_domain)).toBe(true);
  });

  it('filters by what the tenant declared the data to be', async () => {
    const r = await get_prospects({ relationship: 'customer' }, ctxFor(A));
    expect(r.total).toBe(1);
    expect(r.prospects[0].name).toBe('Beta Corp');
  });

  it('filters on completeness', async () => {
    const r = await get_prospects({ min_quality: 0.8 }, ctxFor(A));
    expect(r.prospects.map((p) => p.ref).sort()).toEqual(['PROS-0001', 'PROS-0003']);
  });

  it('shows the delivery tag as inherited on every record from that load', async () => {
    const r = await get_prospects({}, ctxFor(A));
    const acme = r.prospects.find((p) => p.ref === 'PROS-0001')!;
    expect(acme.tags).toEqual([{ id: 11, label: 'FTCCI Telangana', inherited: true }]);
  });

  it('finds records by an inherited tag, not just a direct one', async () => {
    const r = await get_prospects({ tag_id: 11 }, ctxFor(A));
    expect(r.total).toBe(4);   // every record from that load
  });
});

maybe('tag_prospects', () => {
  it('applies a direct tag and shows it alongside the inherited one', async () => {
    const applied = await tag_prospects({ prospect_ids: [1, 2], tag_id: 10 }, ctxFor(A));
    expect(applied.applied).toBe(2);

    const r = await get_prospects({ tag_id: 10 }, ctxFor(A));
    expect(r.total).toBe(2);
    const labels = r.prospects[0].tags.map((t) => `${t.label}:${t.inherited}`).sort();
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

maybe('get_prospect_stats', () => {
  it('reports fill rate and validity separately, never blended', async () => {
    const { stats } = await get_prospect_stats({}, ctxFor(A));
    expect(stats.total).toBe(4);
    expect(stats.customers).toBe(1);
    expect(stats.prospects).toBe(3);
    // Beta Corp is fully populated but has a field that failed validation —
    // the case a single "quality score" would hide.
    expect(stats.with_rejected_fields).toBe(1);
    expect(Number(stats.avg_completeness)).toBeGreaterThan(0);
    expect(Number(stats.avg_validity)).toBeLessThan(1);
  });

  it('counts duplicates and undated records', async () => {
    const { stats } = await get_prospect_stats({}, ctxFor(A));
    expect(stats.sharing_domain).toBe(2);
    expect(stats.undated).toBe(1);
    // Nothing is past 36 months yet, so 'stale' is empty while 'fresh'
    // (≤18mo) is too — the FTCCI rows sit in the band between.
    expect(stats.stale).toBe(0);
    expect(stats.fresh).toBe(0);
  });

  it('is zero for a tenant with no records', async () => {
    const { stats } = await get_prospect_stats({}, ctxFor('44444444-4444-4444-4444-444444444444'));
    expect(stats.total).toBe(0);
  });
});
