/**
 * Scoring profiles (S17) and stored scores against the REAL schema (migration
 * 274 and everything before it):
 *
 *   - the platform default v1 is seeded with the agreed weights; nothing per tenant
 *   - a tenant with no row follows the default; its first save makes v1 "based on platform v1"
 *   - saving what is in force appends nothing; following the platform again works
 *   - a new platform version is visible as "the default changed since"
 *   - tenant scores land in gt_prospects, pool scores in gt_universe_companies (via the matching job)
 *   - the profile table is append-only; another tenant's profile is invisible (as the app role)
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import { followPlatform, resolveProfile, savePlatformProfile, saveTenantProfile, ProfileError } from '../profiles';
import { rescoreTenant, explainProspect } from '../rescore';
import { resolveChunk } from '../../etl/pool-merge';
import { profile as profileFn } from '../../skills/scoring/functions/profile';
import { save_profile } from '../../skills/scoring/functions/save-profile';
import { levels } from '../../skills/scoring/functions/levels';

let mockPool: Pool | undefined;
jest.mock('../../db/pool', () => ({ getPool: () => mockPool }));

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'scoring_test';
const BACKEND = path.resolve(__dirname, '../../..');
const A = '44444444-4444-4444-4444-444444444444';
const B = '55555555-5555-5555-5555-555555555555';
const ctxOf = (tenant: string, role = 'owner', is_admin = false) =>
  ({ tenant_id: tenant, is_live: false, user_id: '', role, is_admin, db: null }) as never;

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();
const d = available ? describe : describe.skip;
let pool: Pool;

beforeAll(async () => {
  if (!available) return;
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres' });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  mockPool = pool;
  await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1, 'scoring-a'), ($2, 'scoring-b')`, [A, B]);
}, 180000);
afterAll(async () => { if (pool) await pool.end(); });

d('scoring profiles', () => {
  it('seeds the platform default v1 with the agreed weights, and nothing per tenant', async () => {
    const rows = (await pool.query('SELECT tenant_id, version, part_weights, level_bounds FROM gt_score_profiles')).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant_id: null, version: 1,
      part_weights: { identity: 20, firmographics: 20, digital: 10, contact: 20, people: 15, research: 10, signals: 5 },
      level_bounds: { identified: 20, qualified: 40, reachable: 60, campaign_ready: 75, strong: 90 } });
    const p = await resolveProfile(pool, A);
    expect(p).toMatchObject({ scope: 'platform', version: 1, own: false });
  });

  it("a tenant's first save is its v1, based on platform v1; saving the same again appends nothing", async () => {
    const w = { identity: 15, firmographics: 15, digital: 20, contact: 25, people: 15, research: 10, signals: 0 };
    expect(await saveTenantProfile(pool, A, w, null)).toEqual({ version: 1, changed: true });
    expect(await saveTenantProfile(pool, A, w, null)).toEqual({ version: 1, changed: false });
    const p = await resolveProfile(pool, A);
    expect(p).toMatchObject({ scope: 'tenant', version: 1, own: true, basedOnVersion: 1, platformChanged: false, partWeights: w });
    expect(p.levelBounds.qualified).toBe(40);   // levels stay the platform's
  });

  it('a tenant saving the default\'s own numbers keeps following the default', async () => {
    const v1 = { identity: 20, firmographics: 20, digital: 10, contact: 20, people: 15, research: 10, signals: 5 };
    expect((await saveTenantProfile(pool, B, v1, null)).changed).toBe(false);
    expect((await resolveProfile(pool, B)).own).toBe(false);
  });

  it('refuses weights that do not add up to 100', async () => {
    await expect(saveTenantProfile(pool, A, { identity: 50, firmographics: 20, digital: 10, contact: 20, people: 15, research: 10, signals: 5 }, null))
      .rejects.toThrow(ProfileError);
  });

  it('a new platform version shows as "the default changed since"; following it again works', async () => {
    const r = await savePlatformProfile(pool, {
      part_weights: { identity: 20, firmographics: 20, digital: 15, contact: 20, people: 10, research: 10, signals: 5 }, note: 'test v2',
    }, null);
    expect(r.version).toBe(2);
    expect(await resolveProfile(pool, A)).toMatchObject({ own: true, platformChanged: true, platformVersion: 2 });
    expect((await resolveProfile(pool, B)).partWeights.digital).toBe(15);   // B follows the default
    expect(await followPlatform(pool, A, null)).toEqual({ changed: true });
    expect(await resolveProfile(pool, A)).toMatchObject({ own: false, version: 2 });
  });

  it('is append-only', async () => {
    await expect(pool.query('UPDATE gt_score_profiles SET note = 1::text')).rejects.toThrow(/append-only/);
  });

  it('the skill: profile is readable by anyone, saving needs an owner or admin', async () => {
    const view = await profileFn({}, ctxOf(B, 'planner'));
    expect(view.can_edit).toBe(false);
    expect(view.parts.map((p) => p.key)).toEqual(['identity', 'firmographics', 'digital', 'contact', 'people', 'research', 'signals']);
    await expect(save_profile({ part_weights: {} }, ctxOf(B, 'planner'))).rejects.toThrow(/owner or admin/);
  });

  it("another tenant's profile is invisible to the app role", async () => {
    await saveTenantProfile(pool, B, { identity: 10, firmographics: 30, digital: 10, contact: 20, people: 15, research: 10, signals: 5 }, null);
    const roleExists = (await pool.query(`SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app'`)).rows.length > 0;
    if (!roleExists) return;
    const app = new Pool({ host: HOST, port: PORT, user: 'vanigtm_app', database: DB });
    try {
      const c = await app.connect();
      await c.query('BEGIN'); await c.query('SELECT set_tenant_context($1)', [A]);
      const seen = (await c.query('SELECT tenant_id FROM gt_score_profiles')).rows.map((r) => r.tenant_id);
      await c.query('COMMIT'); c.release();
      expect(seen).not.toContain(B);
      expect(seen).toContain(A);
      expect(seen).toContain(null);
    } finally { await app.end(); }
  });
});

d('stored scores', () => {
  it("scores a tenant's companies into gt_prospects, with the profile that made them", async () => {
    const ins = await pool.query(
      `INSERT INTO gt_prospects (tenant_id, name, city, state_code, pin, industry_id, domain_normalized, email, phone, address_line, description)
       VALUES ($1, 'Kavya Lab Instruments', 'Hyderabad', 'TG', '500055', (SELECT min(id) FROM gt_industries), 'kavyalab.example',
               'sales@kavyalab.example', '+91 40 1234', 'Plot 4', 'Makes HPLC columns and lab consumables for QC labs across India.'),
              ($1, 'Bare Name Traders', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
       RETURNING id`, [A]);
    expect(await rescoreTenant(pool, A)).toBe(2);
    const rows = (await pool.query(`SELECT name, score, score_reasons FROM gt_prospects WHERE tenant_id = $1 ORDER BY id`, [A])).rows;
    expect(rows[0].score).toBeGreaterThan(rows[1].score);
    expect(rows[0].score_reasons).toMatchObject({ profile: { scope: 'platform', version: 2 } });
    // A tenant list rarely says company-or-individual, so Complete waits on enrichment: identified, not qualified.
    expect(rows[0].score_reasons.level).toBe('identified');
    expect(rows[1].score_reasons.level).toBe('raw');
    const ex = await explainProspect(pool, A, String(ins.rows[0].id));
    expect(ex!.parts.find((p) => p.key === 'contact')!.items.find((i) => i.key === 'email')!.evidence).toBe('sales@kavyalab.example');
    const lv = await levels({}, ctxOf(A));
    expect((lv as any).tenant).toMatchObject({ total: 2, unscored: 0 });
  });

  it('the pool matching job scores each company it re-tests, with the platform default', async () => {
    const src = (await pool.query(`SELECT id FROM gt_data_sources ORDER BY id LIMIT 1`)).rows[0].id;
    const load = (await pool.query(
      `INSERT INTO gt_source_loads (source_id, label, as_of, file_checksum) VALUES ($1, 'scoring test', '2026-10-01', 'chk-scoring') RETURNING id`, [src])).rows[0].id;
    await pool.query(
      `INSERT INTO gt_universe_company_sources (source_id, load_id, source_record_id, name, city, pin)
       VALUES ($1, $2, 'r1', 'Analab Scientific Instruments', 'Hyderabad', '500032')`, [src, load]);
    while (await resolveChunk(pool, load)) { /* drain */ }
    const c = (await pool.query(`SELECT coverage_score, coverage_parts FROM gt_universe_companies WHERE name_key LIKE 'ANALAB%'`)).rows[0];
    expect(c.coverage_score).toBeGreaterThan(0);
    expect(c.coverage_parts).toMatchObject({ profile: { scope: 'platform', version: 2 } });
  });
});
