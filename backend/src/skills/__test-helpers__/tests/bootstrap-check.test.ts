// Smoke: the real schema loader gives us the real production columns.
import { Pool } from 'pg';
import { execSync } from 'child_process';
import { bootstrapSchema } from '../schema';

const available = (() => {
  try { execSync(`pg_isready -h /tmp -p 55432`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

describe.skip('bootstrap smoke', () => {}); // gated below

(available ? describe : describe.skip)('bootstrap smoke', () => {
  it('produces the exact production columns for the tables we broke on', async () => {
    const admin = new Pool({ host: '/tmp', port: 55432, user: 'postgres', database: 'postgres' });
    await admin.query('DROP DATABASE IF EXISTS bootstrap_check');
    await admin.query('CREATE DATABASE bootstrap_check');
    await admin.end();
    const p = new Pool({ host: '/tmp', port: 55432, user: 'postgres', database: 'bootstrap_check' });
    try {
      await bootstrapSchema(p);
      const cols = (await p.query(`
        SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema='public'`)).rows;
      const has = (t: string, c: string) =>
        cols.some((r) => r.table_name === t && r.column_name === c);
      // Every column the three bugs hit — right ones present, wrong ones absent.
      expect(has('gt_contacts', 'name')).toBe(true);
      expect(has('gt_contacts', 'full_name')).toBe(false);
      expect(has('gt_contact_channels', 'source_url')).toBe(true);
      expect(has('gt_contact_channels', 'updated_at')).toBe(false);
      expect(has('gt_journeys', 'state')).toBe(true);
    } finally { await p.end(); }
  }, 30000);
});
