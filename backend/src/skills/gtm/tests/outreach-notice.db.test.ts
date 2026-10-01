/**
 * The DPDP outreach acknowledgement, end to end, against the REAL schema as
 * the restricted runtime role (every RLS policy applies, the 248 bridge
 * included). The notice is published by running the DRAFT file itself, so
 * the wording that will ship is the wording that was tested. And the gate is
 * asked after each decision — accepting is only worth anything if
 * comms/may-contact.ts reads it.
 */
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { createTenantDb } from '../../../db/query';
import type { SkillContext } from '../../../shared/types';
import { mayContact } from '../../../comms/may-contact';
import { outreach_notice } from '../functions/outreach-notice';
import { accept_outreach_notice } from '../functions/accept-outreach-notice';
import { revoke_outreach_notice } from '../functions/revoke-outreach-notice';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'outreach_notice_test';
const BACKEND = path.resolve(__dirname, '../../../..');
const DRAFT = path.resolve(BACKEND, '../documents/drafts/263_vani_gtm_outreach_notice_v1.sql.draft');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

const A = 'bbbbbbbb-0000-0000-0000-00000000000a';   // vn_tenants ids
const B = 'bbbbbbbb-0000-0000-0000-00000000000b';
const C = 'bbbbbbbb-0000-0000-0000-00000000000c';   // no vani_tenant row: Domain step not done
const OWNER_A = 'cccccccc-0000-0000-0000-00000000000a';

let owner: Pool;
let app: Pool;

const ctx = (tenant: string, role: string, user = OWNER_A): SkillContext =>
  ({ tenant_id: tenant, user_id: user, is_live: true, is_admin: false, role, db: createTenantDb(app, tenant) });

const gtmMay = (tenant: string) =>
  mayContact(app, tenant, { agent: 'gtm', channel: 'email', identifiers: [{ kind: 'email', value: 'lead@prospect.test' }] });

beforeAll(async () => {
  if (!available) return;
  process.env.SUPPRESSION_HASH_KEY = 'test-key-0123456789abcdef0123456789abcdef';
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`,
      DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });

  owner = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await owner.query(`
    INSERT INTO vn_tenants (id, slug, status) VALUES ('${A}','oa','active'), ('${B}','ob','active'), ('${C}','oc','active');
    INSERT INTO vani_tenant (slug, name) VALUES ('oa','A'), ('ob','B');
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vanigtm_app;
  `);
  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
}, 180000);

afterAll(async () => {
  if (app) await app.end();
  if (owner) await owner.end();
});

const d = available ? describe : describe.skip;

d('DPDP outreach acknowledgement', () => {
  it('before the notice is published: nothing to accept, and the gate says no', async () => {
    const s = await outreach_notice({}, ctx(A, 'owner'));
    expect(s).toMatchObject({ status: 'no_notice', in_force: false, notice: null, history: [], can_decide: true });
    await expect(accept_outreach_notice({ notice_id: OWNER_A }, ctx(A, 'owner'))).rejects.toThrow(/not been published/);
    expect(await gtmMay(A)).toMatchObject({ allowed: false, reason: 'no_basis' });
  });

  it('the draft notice applies, and applying it twice changes nothing', async () => {
    const sql = readFileSync(DRAFT, 'utf-8');
    await owner.query(sql);
    await owner.query(sql);
    const r = await owner.query(`SELECT version, body FROM vani_consent_text WHERE tenant_id IS NULL AND agent_code='gtm' AND kind='outreach_notice'`);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].body).toMatch(/^Before VaNi contacts anyone/);
    expect(r.rows[0].body).toMatch(/not legal advice/);
  });

  it('a planner can read it but not accept it', async () => {
    const s = await outreach_notice({}, ctx(A, 'planner'));
    expect(s).toMatchObject({ status: 'not_accepted', can_decide: false });
    await expect(accept_outreach_notice({ notice_id: s.notice!.id }, ctx(A, 'planner'))).rejects.toThrow(/owner or admin/);
    // A context with no role at all is not privileged either.
    await expect(accept_outreach_notice({ notice_id: s.notice!.id }, { ...ctx(A, ''), role: undefined })).rejects.toThrow(/owner or admin/);
  });

  it('accepting a notice that was not the one shown is refused', async () => {
    await expect(accept_outreach_notice({ notice_id: B }, ctx(A, 'owner'))).rejects.toThrow(/notice changed/);
    await expect(accept_outreach_notice({}, ctx(A, 'owner'))).rejects.toThrow(/notice_id is required/);
  });

  it('accept turns the gate on; accepting again appends nothing', async () => {
    const { notice } = await outreach_notice({}, ctx(A, 'owner'));
    const first = await accept_outreach_notice({ notice_id: notice!.id }, ctx(A, 'owner'));
    expect(first).toMatchObject({ status: 'accepted', in_force: true, changed: true });
    expect(first.current).toMatchObject({ action: 'accept', notice_version: 1 });
    expect(await gtmMay(A)).toEqual({ allowed: true });

    const again = await accept_outreach_notice({ notice_id: notice!.id }, ctx(A, 'admin'));
    expect(again).toMatchObject({ status: 'accepted', changed: false });
    expect(again.history).toHaveLength(1);
  });

  it('another workspace sees none of it', async () => {
    const s = await outreach_notice({}, ctx(B, 'owner'));
    expect(s).toMatchObject({ status: 'not_accepted', in_force: false, current: null, history: [] });
    expect(await gtmMay(B)).toMatchObject({ allowed: false, reason: 'no_basis' });
  });

  it('two accepts at once append one row', async () => {
    const { notice } = await outreach_notice({}, ctx(B, 'owner'));
    const both = await Promise.all([
      accept_outreach_notice({ notice_id: notice!.id }, ctx(B, 'owner')),
      accept_outreach_notice({ notice_id: notice!.id }, ctx(B, 'admin')),
    ]);
    expect(both.map((x) => x.changed).sort()).toEqual([false, true]);
    expect((await outreach_notice({}, ctx(B, 'owner'))).history).toHaveLength(1);
  });

  it('revoke turns the gate off at once; revoking again appends nothing', async () => {
    const r = await revoke_outreach_notice({}, ctx(A, 'admin'));
    expect(r).toMatchObject({ status: 'revoked', in_force: false, changed: true });
    expect(r.history.map((h) => h.action)).toEqual(['revoke', 'accept']);
    expect(await gtmMay(A)).toMatchObject({ allowed: false, reason: 'no_basis' });
    expect((await revoke_outreach_notice({}, ctx(A, 'admin'))).changed).toBe(false);
    await expect(revoke_outreach_notice({}, ctx(A, 'planner'))).rejects.toThrow(/owner or admin/);
  });

  it('a workspace without its platform record is told to finish the Domain step', async () => {
    const s = await outreach_notice({}, ctx(C, 'owner'));
    expect(s.status).toBe('not_provisioned');
    await expect(accept_outreach_notice({ notice_id: s.notice!.id }, ctx(C, 'owner'))).rejects.toThrow(/Domain step/);
  });

  it('a new version keeps the old acceptance in force but asks for the new one', async () => {
    // B accepted v1 above.
    await owner.query(`INSERT INTO vani_consent_text (tenant_id, agent_code, kind, version, body)
                       VALUES (NULL, 'gtm', 'outreach_notice', 2, 'Version two')`);
    const s = await outreach_notice({}, ctx(B, 'owner'));
    expect(s).toMatchObject({ status: 'accepted_older', in_force: true, notice: { version: 2 } });
    expect(await gtmMay(B)).toEqual({ allowed: true });
    const v1 = (await owner.query(`SELECT id FROM vani_consent_text WHERE tenant_id IS NULL AND version = 1`)).rows[0].id;
    await expect(accept_outreach_notice({ notice_id: v1 }, ctx(B, 'owner'))).rejects.toThrow(/now version 2/);
    const ok = await accept_outreach_notice({ notice_id: s.notice!.id }, ctx(B, 'owner'));
    expect(ok).toMatchObject({ status: 'accepted', changed: true, current: { notice_version: 2 } });
  });
});
