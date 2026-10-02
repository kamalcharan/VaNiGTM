/**
 * The tenant context (D-Q10) against the real schema: one read, every part
 * from the table that owns it, nothing copied — and a tenant not yet on the
 * platform spine is reported as such, not as an error or an empty success.
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import { getTenantContext } from '../context';
import { saveTenantProfile } from '../../scoring/profiles';
import { addTopup } from '../../agent-core/token.budget';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'tenant_context_test';
const BACKEND = path.resolve(__dirname, '../../..');
const T = '88888888-8888-8888-8888-888888888888';
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
  await pool.query(`INSERT INTO vn_tenants (id, slug, status) VALUES ($1, 'ctx-t', 'active')`, [T]);
  await pool.query(`INSERT INTO vn_tenant_profiles (tenant_id, name, industry, brand_color) VALUES ($1, 'Context Test Co', 'Manufacturing', '#244f3d')`, [T]);
}, 180000);
afterAll(async () => { if (pool) await pool.end(); });

d('getTenantContext', () => {
  it('reads every part from its owner, and says what is not there yet', async () => {
    await saveTenantProfile(pool, T, { identity: 25, firmographics: 15, digital: 10, contact: 20, people: 15, research: 10, signals: 5 }, null);
    await addTopup(pool, T, 5000, null, 'test');
    const c = await getTenantContext(pool, T);
    expect(c.tenant).toMatchObject({ id: T, slug: 'ctx-t', name: 'Context Test Co' });
    expect(c.commercial).toMatchObject({ paid: true, provisioned: false });          // no vani_tenant yet
    expect(c.tokens).toMatchObject({ capped: true, daily_limit: 100000, monthly_limit: 2000000, topup_balance: 5000 });
    expect(c.model).toMatchObject({ posture: 'platform', provider: 'platform' });
    expect(c.model).not.toHaveProperty('key');
    expect(c.scoring).toMatchObject({ scope: 'tenant', own: true, version: 1, based_on_version: 1 });
    expect(c.industry).toMatchObject({ declared: 'Manufacturing' });
    expect(c.brand).toMatchObject({ approved: false, brand_color: '#244f3d' });
    expect(c.agents).toEqual([]);
    expect(c.smart_profile).toEqual({ completion_score: 0, is_complete: false });
    expect(c.consent).toBeDefined();
  });
});
