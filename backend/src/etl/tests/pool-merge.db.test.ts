/**
 * Common pool P1-B against the REAL schema (every migration): the match ladder,
 * survivorship, the Complete test and the lifecycle it sets. Pairs of names
 * were chosen by measuring pg_trgm similarity on the real normaliser:
 *   ANALAB SCIENTIFIC INSTRUMENTS ~ ANALAB SCIENTIFIC INSTRUMENT   0.90  (link)
 *   SRI VENKATESWARA AGENCIES     ~ SRI VENKATESWARA AGENCY        0.79  (flag)
 *   AURO LABS                     ~ AURO PHARMA                    0.29  (different)
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import { resolveChunk, reassessAll, runPoolResolveJob } from '../pool-merge';
import { completeTest, checkName, type GoldenForTest } from '../complete-test';
import { createTenantDb } from '../../db/query';
import { sources } from '../../skills/pool-skill/functions/sources';
import { deliveries } from '../../skills/pool-skill/functions/deliveries';
import { delivery_rows } from '../../skills/pool-skill/functions/delivery-rows';
import { company as companyFn } from '../../skills/pool-skill/functions/company';
import { industries } from '../../skills/pool-skill/functions/industries';
import { decide } from '../../skills/pool-skill/functions/decide';
import { retire_delivery } from '../../skills/pool-skill/functions/retire-delivery';

// The write functions reach the database through getPool(); point it at the test DB.
let mockPool: Pool | undefined;
jest.mock('../../db/pool', () => ({ getPool: () => mockPool }));

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'pool_merge_test';
const BACKEND = path.resolve(__dirname, '../../..');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

let pool: Pool;
const src: Record<string, number> = {};
let industryId = 0;

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
  for (const r of (await pool.query(`SELECT code, id FROM gt_data_sources`)).rows) src[r.code] = r.id;
  industryId = (await pool.query(`SELECT id FROM gt_industries ORDER BY id LIMIT 1`)).rows[0].id;
}, 180000);

afterAll(async () => { if (pool) await pool.end(); });

let loadNo = 0;
async function load(code: string, opts: { tenant?: string | null; defaultIndustry?: number; asOf?: string } = {}) {
  loadNo++;
  const r = await pool.query(
    `INSERT INTO gt_source_loads (source_id, label, tenant_id, as_of, default_industry_id, file_checksum)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [src[code], `test load ${loadNo}`, opts.tenant ?? null, opts.asOf ?? '2026-01-01', opts.defaultIndustry ?? null, `chk-${loadNo}-${Date.now()}`]);
  return Number(r.rows[0].id);
}
let rowNo = 0;
async function row(loadId: number, f: Record<string, unknown>) {
  rowNo++;
  const s = await pool.query('SELECT source_id FROM gt_source_loads WHERE id = $1', [loadId]);
  const cols = ['source_id', 'load_id', 'source_record_id', ...Object.keys(f)];
  const vals = [s.rows[0].source_id, loadId, `r${rowNo}`, ...Object.values(f)];
  const r = await pool.query(
    `INSERT INTO gt_universe_company_sources (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING id`, vals);
  return Number(r.rows[0].id);
}
const companyOf = async (sourceId: number) =>
  (await pool.query('SELECT company_id FROM gt_universe_company_sources WHERE id = $1', [sourceId])).rows[0].company_id as string | null;
const company = async (id: string) => (await pool.query('SELECT * FROM gt_universe_companies WHERE id = $1', [id])).rows[0];
async function drain(loadId: number | null = null) {
  let n = 0;
  for (;;) { const c = await resolveChunk(pool, loadId); if (!c) return n; n += c.resolved; }
}

const d = available ? describe : describe.skip;

describe('the Complete test (pure)', () => {
  const base: GoldenForTest = {
    name: 'Analab Scientific Instruments Pvt Ltd', name_key: 'ANALAB SCIENTIFIC INSTRUMENTS',
    domain_normalized: 'analab.in', domain_status: null, cin: null, llpin: null, gstin: null,
    pin: '500004', city: 'Hyderabad', state_code: 'TS', industry_id: 7, nic_codes: [],
    is_individual: false, legal_status: null, duplicate_of_id: null, needs_review: false, linked_sources: 1,
  };
  it('passes a fully known company, with legal status not applicable', () => {
    const r = completeTest(base);
    expect(r).toMatchObject({ complete: true, passed: 8, total: 8, needs_person: false });
    expect(r.checks.find((c) => c.key === 'legal')?.status).toBe('na');
  });
  it('leaves what enrichment fills as pending, not failed', () => {
    const r = completeTest({ ...base, industry_id: null, is_individual: null, domain_normalized: null });
    expect(r.complete).toBe(false);
    expect(r.checks.filter((c) => c.status === 'pending').map((c) => c.key).sort()).toEqual(['domain_lookup', 'industry', 'type']);
    expect(r.checks.some((c) => c.status === 'fail')).toBe(false);
  });
  it('a delivered domain is not yet an anchor; name + PIN is', () => {
    expect(completeTest({ ...base, pin: null }).checks.find((c) => c.key === 'anchor')?.status).toBe('pending');
    expect(completeTest({ ...base, pin: null, domain_status: 'found' }).checks.find((c) => c.key === 'anchor')?.status).toBe('pass');
  });
  it('fails what disqualifies: a placeholder name, an individual, struck off', () => {
    for (const n of ['TEST ENTRY', 'n/a', '---', '12345', 'Plot No 4, Road 2']) expect(checkName(n).status).toBe('fail');
    expect(checkName('Sri Venkateswara Agencies').status).toBe('pass');
    expect(completeTest({ ...base, is_individual: true }).checks.find((c) => c.key === 'type')?.status).toBe('fail');
    expect(completeTest({ ...base, legal_status: 'struck_off' }).checks.find((c) => c.key === 'legal')?.status).toBe('fail');
  });
  it('an open duplicate flag needs a person', () => {
    const r = completeTest({ ...base, duplicate_of_id: 9, needs_review: true });
    expect(r).toMatchObject({ complete: false, needs_person: true });
  });
});

d('the match ladder and the lifecycle (real schema)', () => {
  it('rung 1: the same CIN is one company, whatever the name says', async () => {
    const a = await load('mca'); const b = await load('legacy_dir');
    const s1 = await row(a, { name: 'Nova Polymers Private Limited', cin: 'U25200TG2010PTC070001', city: 'Hyderabad', state_code: 'TS' });
    const s2 = await row(b, { name: 'NOVA POLYMERS', cin: 'U25200TG2010PTC070001' });
    await drain();
    expect(await companyOf(s1)).toBe(await companyOf(s2));
  });

  it('rung 2 links the same name on one domain; 2b flags a sister company on it', async () => {
    const l = await load('legacy_dir');
    const a = await row(l, { name: 'Auro Labs Pvt Ltd', domain_normalized: 'aurogroup.in', city: 'Hyderabad' });
    const b = await row(l, { name: 'AURO LABS LIMITED', domain_normalized: 'aurogroup.in' });
    const c = await row(l, { name: 'Auro Pharma', domain_normalized: 'aurogroup.in' });
    await drain(l);
    expect(await companyOf(a)).toBe(await companyOf(b));
    const sister = await company((await companyOf(c))!);
    expect(String(sister.duplicate_of_id)).toBe(await companyOf(a));
    expect(sister.needs_review).toBe(true);
    expect(sister.lifecycle_state).toBe('held');
    expect(sister.complete_checks.checks.find((k: any) => k.key === 'match').status).toBe('review');
  });

  it('rung 3 name + PIN, rung 4 near name in the same city, rung 5 flags a near name in the same state', async () => {
    const l = await load('legacy_dir');
    const a = await row(l, { name: 'Krishna Traders', pin: '500001', city: 'Hyderabad', state_code: 'TS' });
    const b = await row(l, { name: 'KRISHNA TRADERS', pin: '500001' });
    const c = await row(l, { name: 'Analab Scientific Instruments Pvt Ltd', city: 'Hyderabad', state_code: 'TS' });
    const e = await row(l, { name: 'Analab Scientific Instrument', city: 'hyderabad' });
    const f = await row(l, { name: 'Sri Venkateswara Agencies', city: 'Warangal', state_code: 'TS' });
    const g = await row(l, { name: 'Sri Venkateswara Agency', city: 'Karimnagar', state_code: 'TS' });
    await drain(l);
    expect(await companyOf(a)).toBe(await companyOf(b));
    expect(await companyOf(c)).toBe(await companyOf(e));
    const near = await company((await companyOf(g))!);
    expect(near.id).not.toBe(await companyOf(f));
    expect(String(near.duplicate_of_id)).toBe(await companyOf(f));
  });

  it('survivorship: the most trusted source wins each field, lists are unioned, provenance per field', async () => {
    const low = await load('legacy_dir'); const high = await load('mca');
    const a = await row(low, { name: 'Zenith Castings', city: 'Secunderabad', phone: '040-1111', cin: 'U27100TG2001PTC000002', phones: ['040-1111', '040-2222'] });
    await row(high, { name: 'ZENITH CASTINGS PRIVATE LIMITED', city: 'Hyderabad', cin: 'U27100TG2001PTC000002', legal_status: 'active', phones: ['040-3333'] });
    await drain();
    const g = await company((await companyOf(a))!);
    expect(g.city).toBe('Hyderabad');                 // MCA (tier 90) beats the legacy directory (20)
    expect(g.phone).toBe('040-1111');                 // only the directory gave one
    expect(g.legal_status).toBe('active');
    expect([...g.phones].sort()).toEqual(['040-1111', '040-2222', '040-3333']);
    expect(g.field_sources.city.source).toBe('mca');
    expect(g.field_sources.phone.source).toBe('legacy_dir');
    expect([...g.source_codes].sort()).toEqual(['legacy_dir', 'mca']);
  });

  it('a company that passes all eight is admitted; retiring its delivery takes it back out', async () => {
    const l = await load('legacy_dir', { defaultIndustry: industryId });
    const s = await row(l, { name: 'Orbit Valves Pvt Ltd', pin: '500032', city: 'Hyderabad', state_code: 'TS',
      domain_normalized: 'orbitvalves.in', is_individual: false });
    await drain(l);
    const cid = (await companyOf(s))!;
    let g = await company(cid);
    expect(g.lifecycle_state).toBe('complete');
    expect(g.admitted_at).not.toBeNull();
    expect(g.field_sources.industry_id.via).toBe('delivery default');

    await pool.query(`UPDATE gt_source_loads SET status = 'retired' WHERE id = $1`, [l]);
    await reassessAll(pool, undefined, [cid]);
    g = await company(cid);
    expect(g.lifecycle_state).toBe('candidate');
    expect(g.admitted_at).toBeNull();
    expect(g.complete_checks.checks.find((k: any) => k.key === 'match').status).toBe('pending');
  });

  it('an incomplete record says why, and stays out of the pool', async () => {
    const l = await load('legacy_dir');
    const s = await row(l, { name: 'Bhavani Electricals', city: 'Hyderabad', state_code: 'TS', pin: '500003' });
    await drain(l);
    const g = await company((await companyOf(s))!);
    expect(g.lifecycle_state).toBe('candidate');
    expect(g.complete_checks.passed).toBe(5);
    expect(g.complete_checks.checks.filter((k: any) => k.status === 'pending').map((k: any) => k.key).sort())
      .toEqual(['domain_lookup', 'industry', 'type']);
  });

  it('junk stays junk through a re-run; a tenant delivery and a retired one are never resolved', async () => {
    const l = await load('legacy_dir');
    const s = await row(l, { name: 'Dummy Co', city: 'Hyderabad' });
    await drain(l);
    const cid = (await companyOf(s))!;
    await pool.query(`UPDATE gt_universe_companies SET lifecycle_state = 'junk', junk_reason = 'placeholder' WHERE id = $1`, [cid]);
    await reassessAll(pool, undefined, [cid]);
    expect((await company(cid)).lifecycle_state).toBe('junk');

    const tenant = (await pool.query(`SELECT id FROM vn_tenants LIMIT 1`)).rows[0]?.id
      ?? (await pool.query(`INSERT INTO vn_tenants (name, slug) VALUES ('T', 't-merge') RETURNING id`)).rows[0].id;
    const own = await load('upload', { tenant });
    const mine = await row(own, { name: 'Tenant Only Co' });
    const gone = await load('legacy_dir');
    const old = await row(gone, { name: 'Retired Co' });
    await pool.query(`UPDATE gt_source_loads SET status = 'retired' WHERE id = $1`, [gone]);
    await drain();
    expect(await companyOf(mine)).toBeNull();
    expect(await companyOf(old)).toBeNull();
  });

  it('the worker job is idempotent and says what the pool now holds', async () => {
    const l = await load('legacy_dir');
    await row(l, { name: 'Idem Potent Industries', city: 'Pune', state_code: 'MH' });
    const steps: any[] = [];
    const runId = (await pool.query(
      `INSERT INTO gt_agent_runs (tenant_id, agent_name, status) SELECT id, 'pool-merge', 'running' FROM vn_tenants LIMIT 1 RETURNING id`)).rows[0]?.id;
    const first = await runPoolResolveJob(pool, '', { load_id: l }, runId);
    expect(first.resolved).toBe(1);
    const again = await runPoolResolveJob(pool, '', { load_id: l }, runId);
    expect(again.resolved).toBe(0);
    const run = (await pool.query('SELECT steps FROM gt_agent_runs WHERE id = $1', [runId])).rows[0];
    steps.push(...run.steps);
    expect(steps[steps.length - 1].action).toMatch(/^Pool now: /);
  });
});

d('pool-skill: what the admin sees and decides', () => {
  let tenant = '';
  const ctx = (is_admin: boolean) => ({ tenant_id: tenant, is_live: true, user_id: '00000000-0000-0000-0000-000000000001',
    is_admin, db: createTenantDb(pool, tenant) }) as any;

  beforeAll(async () => {
    tenant = (await pool.query(`SELECT id FROM vn_tenants LIMIT 1`)).rows[0]?.id
      ?? (await pool.query(`INSERT INTO vn_tenants (name, slug) VALUES ('Vikuna', 'vikuna-skill') RETURNING id`)).rows[0].id;
  });

  it('every function refuses a tenant that is not the admin', async () => {
    for (const fn of [() => sources({}, ctx(false)), () => deliveries({}, ctx(false)), () => industries({}, ctx(false)),
      () => decide({ company_id: 1, decision: 'company' }, ctx(false)), () => retire_delivery({ load_id: 1 }, ctx(false))]) {
      await expect(fn()).rejects.toThrow(/admin tenants only/);
    }
  });

  it('a delivery reads by state, and each row says what is still open', async () => {
    const l = await load('legacy_dir');
    await row(l, { name: 'State Count One', city: 'Hyderabad', state_code: 'TS', pin: '500010' });
    await row(l, { name: 'State Count Two', city: 'Hyderabad', state_code: 'TS', pin: '500011' });
    await row(l, { name: 'Not Yet Matched' });
    await drain(l);
    const dl = (await deliveries({}, ctx(true))).deliveries.find((x: any) => x.id === String(l))!;
    expect(dl).toMatchObject({ source_rows: 3, unmatched: 0, waiting: 3 });
    const rows = await delivery_rows({ load_id: l, state: 'waiting' }, ctx(true));
    expect(rows.total).toBe(3);
    const one = rows.rows.find((x: any) => x.name === 'State Count One')!;
    expect(one.open.map((k: any) => k.key).sort()).toEqual(['domain_lookup', 'industry', 'type']);
    const src = (await sources({}, ctx(true))).sources.find((x: any) => x.code === 'legacy_dir')!;
    expect(src.source_rows).toBeGreaterThan(0);
  });

  it('company or individual is a decision row; individual is junk out of scope; restore re-tests', async () => {
    const l = await load('legacy_dir', { defaultIndustry: industryId });
    const s = await row(l, { name: 'Ramesh Associates', city: 'Hyderabad', state_code: 'TS', pin: '500004', domain_normalized: 'rameshassoc.in' });
    await drain(l);
    const cid = (await companyOf(s))!;

    let out = await decide({ company_id: cid, decision: 'company' }, ctx(true));
    expect(out.company).toMatchObject({ is_individual: false, lifecycle_state: 'complete' });
    let full = await companyFn({ company_id: cid }, ctx(true));
    expect(full.company.field_sources.is_individual.source).toBe('manual');
    expect(full.company.field_sources.name.source).toBe('legacy_dir');      // the decision row speaks for one field only
    expect(full.company.complete_checks.checks.find((k: any) => k.key === 'match').detail).toBe('new');

    out = await decide({ company_id: cid, decision: 'individual' }, ctx(true));
    expect(out.company).toMatchObject({ is_individual: true, lifecycle_state: 'junk', junk_reason: 'out_of_scope' });
    full = await companyFn({ company_id: cid }, ctx(true));
    expect(full.sources.filter((x: any) => x.is_decision)).toHaveLength(1);   // the same decision row, changed

    await expect(decide({ company_id: cid, decision: 'junk' }, ctx(true))).rejects.toThrow(/junk reason is required/);
    out = await decide({ company_id: cid, decision: 'restore' }, ctx(true));
    expect(out.company.lifecycle_state).toBe('held');                        // an individual fails Complete: a person must look
    out = await decide({ company_id: cid, decision: 'company' }, ctx(true));
    expect(out.company.lifecycle_state).toBe('complete');
  });

  it('not a duplicate closes the flag; retiring a delivery takes its companies out of the pool', async () => {
    const l = await load('legacy_dir', { defaultIndustry: industryId });
    const a = await row(l, { name: 'Kaveri Seeds', domain_normalized: 'kaveriseeds.in', city: 'Secunderabad', state_code: 'TS', pin: '500003', is_individual: false });
    const b = await row(l, { name: 'Kaveri Agritech', domain_normalized: 'kaveriseeds.in', city: 'Secunderabad', state_code: 'TS', pin: '500003', is_individual: false });
    await drain(l);
    const sister = (await companyOf(b))!;
    expect((await company(sister)).lifecycle_state).toBe('held');
    const out = await decide({ company_id: sister, decision: 'not_duplicate' }, ctx(true));
    expect(out.company).toMatchObject({ needs_review: false, lifecycle_state: 'complete' });
    await expect(decide({ company_id: (await companyOf(a))!, decision: 'not_duplicate' }, ctx(true))).rejects.toThrow(/not flagged/);

    const r = await retire_delivery({ load_id: l }, ctx(true));
    expect(r.companies_retested).toBe(2);
    expect((await company(sister)).lifecycle_state).toBe('candidate');
    await expect(retire_delivery({ load_id: l }, ctx(true))).rejects.toThrow(/not an active/);
  });

  it('the industry master rolls counts up to its sectors', async () => {
    const tree = (await industries({}, ctx(true))).industries;
    expect(tree.length).toBeGreaterThan(5);
    const withKids = tree.find((n: any) => n.children.length);
    if (withKids) expect(withKids.companies).toBeGreaterThanOrEqual(withKids.children.reduce((a: number, c: any) => a + c.companies, 0));
  });
});
