/**
 * The contact gate against the REAL schema, as the restricted runtime role.
 *
 * The database is built by the real migration runner from every migration
 * (not a copied schema), and the gate runs as a NOSUPERUSER NOBYPASSRLS role
 * shaped like production's vanigtm_app, so every RLS policy applies — the
 * two-tenant-id bridge (248) included.
 */
import { execSync } from 'child_process';
import path from 'path';
import { Pool } from 'pg';
import { mayContact, recordSuppression, liftSuppression, type Verdict } from '../may-contact';

const detailOf = (v: Verdict): string => ('detail' in v ? v.detail : '');

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'may_contact_test';
const BACKEND = path.resolve(__dirname, '../../..');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

const A = 'aaaaaaaa-0000-0000-0000-00000000000a';   // vn_tenants ids (what the JWT carries)
const B = 'aaaaaaaa-0000-0000-0000-00000000000b';
const KEY = 'test-key-0123456789abcdef0123456789abcdef';

let owner: Pool;
let app: Pool;
let candOk: string;
let candWithdrawn: string;
let candExpired: string;

const email = (value: string) => ({ kind: 'email' as const, value });

beforeAll(async () => {
  if (!available) return;
  process.env.SUPPRESSION_HASH_KEY = KEY;
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();

  const url = `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`;
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: url, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });

  owner = new Pool({ host: HOST, port: PORT, user: USER, database: DB });
  await owner.query(`
    INSERT INTO vn_tenants (id, slug, status) VALUES ('${A}','ta','active'), ('${B}','tb','active');
    INSERT INTO vani_tenant (slug, name) VALUES ('ta','A'), ('tb','B');
    DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='vanigtm_app') THEN
      CREATE ROLE vanigtm_app NOSUPERUSER NOBYPASSRLS NOLOGIN; END IF; END $$;
    GRANT USAGE ON SCHEMA public TO vanigtm_app;
    -- production's grant script gives DML on every table; the append-only
    -- trigger, not the grant, is what stops edits
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vanigtm_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO vanigtm_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO vanigtm_app;
    INSERT INTO vani_consent_text (tenant_id, agent_code, kind, version, body)
      VALUES (NULL, 'gtm', 'outreach_notice', 1, 'DPDP outreach notice v1');
  `);

  // Vara candidates for tenant A: in force, withdrawn, past retention.
  const va = (await owner.query(`SELECT id FROM vani_tenant WHERE slug='ta'`)).rows[0].id;
  const mk = async (withdrawn: boolean, retention: string) => {
    const cand = (await owner.query(
      `INSERT INTO vara_candidate (tenant_id, display_name, retention_until) VALUES ($1, 'C', $2) RETURNING id`,
      [va, retention])).rows[0].id;
    const cons = (await owner.query(
      `INSERT INTO vara_consent (tenant_id, candidate_id, consent_version, channel, withdrawn_at)
       VALUES ($1, $2, 'v1', 'web', $3) RETURNING id`, [va, cand, withdrawn ? new Date() : null])).rows[0].id;
    await owner.query(`UPDATE vara_candidate SET current_consent_id = $1 WHERE id = $2`, [cons, cand]);
    return cand;
  };
  candOk = await mk(false, '2099-01-01');
  candWithdrawn = await mk(true, '2099-01-01');
  candExpired = await mk(false, '2020-01-01');

  app = new Pool({ host: HOST, port: PORT, user: USER, database: DB, options: '-c role=vanigtm_app' });
}, 180000);

afterAll(async () => {
  if (app) await app.end();
  if (owner) await owner.end();
});

const d = available ? describe : describe.skip;

const accept = async (tenant: string) => {
  await owner.query(`
    INSERT INTO vani_tenant_acknowledgement (tenant_id, kind, action, notice_id, actor_id)
    SELECT vt.id, 'gtm_outreach_dpdp', 'accept', ct.id, gen_random_uuid()
      FROM vani_tenant vt JOIN vn_tenants t ON t.slug = vt.slug,
           vani_consent_text ct WHERE t.id = $1 AND ct.tenant_id IS NULL`, [tenant]);
};

d('mayContact — the gate', () => {
  it('fails closed without SUPPRESSION_HASH_KEY', async () => {
    delete process.env.SUPPRESSION_HASH_KEY;
    try {
      const v = await mayContact(app, A, { agent: 'gtm', channel: 'email', identifiers: [email('x@acme.test')] });
      expect(v).toMatchObject({ allowed: false, reason: 'check_failed' });
      expect(detailOf(v)).toMatch(/SUPPRESSION_HASH_KEY/);
    } finally { process.env.SUPPRESSION_HASH_KEY = KEY; }
  });

  it('refuses an address it cannot normalise', async () => {
    const v = await mayContact(app, A, { agent: 'gtm', channel: 'email', identifiers: [email('not-an-email')] });
    expect(v).toMatchObject({ allowed: false, reason: 'invalid_identifier' });
  });

  it('GTM: no DPDP acknowledgement → no_basis; accepted → allowed; switched off → no_basis', async () => {
    const req = { agent: 'gtm' as const, channel: 'email' as const, identifiers: [email('lead@acme.test')] };
    expect(await mayContact(app, A, req)).toMatchObject({ allowed: false, reason: 'no_basis' });
    await accept(A);
    expect(await mayContact(app, A, req)).toEqual({ allowed: true });
    // Tenant B has not accepted — A's acceptance is not B's.
    expect(await mayContact(app, B, req)).toMatchObject({ allowed: false, reason: 'no_basis' });
  });

  it('an unsubscribe from GTM blocks GTM on that channel only, and not Vara', async () => {
    await recordSuppression(app, A, { agent: 'gtm', channel: 'email', identifiers: [email('Jo@Acme.test ')],
      reason: 'unsubscribed', source: 'unsubscribe_link', actor: { type: 'subject' } });
    const v = await mayContact(app, A, { agent: 'gtm', channel: 'email', identifiers: [email('jo@acme.test')] });
    expect(v).toMatchObject({ allowed: false, reason: 'suppressed' });
    expect(detailOf(v)).toMatch(/unsubscribed \(this tenant, gtm, email/);
    // Another channel for the same agent is a different question.
    expect(await mayContact(app, A, { agent: 'gtm', channel: 'whatsapp', identifiers: [email('jo@acme.test')] }))
      .toEqual({ allowed: true });
    // Agent-wise (Charan): the same person's Vara application stays open.
    expect(await mayContact(app, A, { agent: 'vara', channel: 'email', identifiers: [email('jo@acme.test')], candidateId: candOk }))
      .toEqual({ allowed: true });
  });

  it('one tenant\'s unsubscribe does not block another tenant', async () => {
    await accept(B);
    expect(await mayContact(app, B, { agent: 'gtm', channel: 'email', identifiers: [email('jo@acme.test')] }))
      .toEqual({ allowed: true });
  });

  it('a bounce blocks every tenant and every agent', async () => {
    await recordSuppression(app, A, { agent: null, channel: 'email', identifiers: [email('dead@acme.test')],
      reason: 'bounced', source: 'provider_webhook', actor: { type: 'system' } });
    for (const t of [A, B]) {
      const v = await mayContact(app, t, { agent: 'gtm', channel: 'email', identifiers: [email('dead@acme.test')] });
      expect(v).toMatchObject({ allowed: false, reason: 'suppressed' });
      expect(detailOf(v)).toMatch(/bounced \(every tenant/);
    }
  });

  it('a domain block covers every address at that domain ("nobody here")', async () => {
    await recordSuppression(app, A, { agent: 'gtm', channel: 'all', identifiers: [{ kind: 'domain', value: 'www.noone.test' }],
      reason: 'manual', source: 'console', actor: { type: 'human', id: null } });
    const v = await mayContact(app, A, { agent: 'gtm', channel: 'sms', identifiers: [email('anyone@noone.test')] });
    expect(v).toMatchObject({ allowed: false, reason: 'suppressed' });
    expect(detailOf(v)).toMatch(/whole email domain/);
  });

  it('Vara: consent in force → allowed; none, withdrawn, expired → refused', async () => {
    const base = { agent: 'vara' as const, channel: 'email' as const, identifiers: [email('cand@x.test')] };
    expect(await mayContact(app, A, { ...base, candidateId: candOk })).toEqual({ allowed: true });
    expect(await mayContact(app, A, base)).toMatchObject({ reason: 'no_consent' });
    expect(await mayContact(app, A, { ...base, candidateId: candWithdrawn })).toMatchObject({ reason: 'consent_withdrawn' });
    expect(await mayContact(app, A, { ...base, candidateId: candExpired })).toMatchObject({ reason: 'retention_expired' });
    // Another tenant cannot contact A's candidate.
    expect(await mayContact(app, B, { ...base, candidateId: candOk })).toMatchObject({ reason: 'no_consent' });
  });
});

d('liftSuppression — D9-d', () => {
  const unsub = { agent: 'gtm' as const, channel: 'email' as const, identifier: email('jo@acme.test') };

  it('an admin cannot undo a person\'s unsubscribe', async () => {
    await expect(liftSuppression(app, A, { ...unsub, actor: { type: 'human' }, source: 'console' }))
      .rejects.toThrow(/LIFT_NOT_ALLOWED.*only the person can/);
  });

  it('the person can, by opting in again — and the gate opens', async () => {
    await liftSuppression(app, A, { ...unsub, actor: { type: 'subject' }, source: 'opt_in_link' });
    expect(await mayContact(app, A, { agent: 'gtm', channel: 'email', identifiers: [email('jo@acme.test')] }))
      .toEqual({ allowed: true });
    // …and a second lift has nothing to lift.
    await expect(liftSuppression(app, A, { ...unsub, actor: { type: 'subject' }, source: 'opt_in_link' }))
      .rejects.toThrow(/NOT_SUPPRESSED/);
  });

  it('an admin can undo the tenant\'s own manual block; the person cannot', async () => {
    const man = { agent: 'gtm' as const, channel: 'email' as const, identifier: email('mgr@acme.test') };
    await recordSuppression(app, A, { agent: 'gtm', channel: 'email', identifiers: [man.identifier],
      reason: 'manual', source: 'console', actor: { type: 'human' } });
    await expect(liftSuppression(app, A, { ...man, actor: { type: 'subject' }, source: 'opt_in_link' }))
      .rejects.toThrow(/LIFT_NOT_ALLOWED/);
    await liftSuppression(app, A, { ...man, actor: { type: 'human' }, source: 'console' });
    expect(await mayContact(app, A, { agent: 'gtm', channel: 'email', identifiers: [man.identifier] })).toEqual({ allowed: true });
  });

  it('a tenant can never lift a platform-wide block', async () => {
    await expect(liftSuppression(app, A, { agent: null, channel: 'email', identifier: email('dead@acme.test'),
      actor: { type: 'human' }, source: 'console' })).rejects.toThrow(/every tenant \(bounced\).*platform operator/);
  });

  it('rows cannot be edited even though the role holds UPDATE', async () => {
    await expect(owner.query(`UPDATE vani_suppression SET reason = 'manual'`)).rejects.toThrow(/append-only/);
  });
});
