/**
 * Join a workspace by a shared link, end to end: the REAL auth router over
 * HTTP, against the schema the real migration runner builds. The inviting
 * workspace is made by the real register(); nothing is hand-inserted.
 */
import { execSync } from 'child_process';
import path from 'path';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { AddressInfo } from 'net';
import { Pool } from 'pg';
import { createAuthRouter } from '../auth.routes';
import { register } from '../auth.service';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'invitation_test';
const BACKEND = path.resolve(__dirname, '../../..');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

let pool: Pool;
let server: ReturnType<express.Express['listen']>;
let origin = '';
let ownerToken = '';
let ownerTenant = '';
let otherToken = '';

const fakeReq = { headers: { 'user-agent': 'jest' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;

async function call(method: string, p: string, body?: unknown, token?: string) {
  const res = await fetch(`${origin}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

const invite = (email: string, role_id = 'planner', token = ownerToken) =>
  call('POST', '/invite', { invitations: [{ email, role_id }] }, token);

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`,
      DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });

  const a = await register(pool, { name: 'Owner One', email: 'owner@acme.test', password: 'Passw0rdA', tenant_name: 'Acme' }, fakeReq);
  ownerToken = a.tokens.access_token;
  ownerTenant = a.tenant.id;
  const b = await register(pool, { name: 'Other Owner', email: 'owner@other.test', password: 'Passw0rdB', tenant_name: 'Other' }, fakeReq);
  otherToken = b.tokens.access_token;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/', createAuthRouter(pool));
  await new Promise<void>((resolve) => { server = app.listen(0, () => resolve()); });
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 240000);

afterAll(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (pool) await pool.end();
});

const d = available ? describe : describe.skip;

d('a link, not an email', () => {
  let token = '';

  it('invite returns a one-time token and says "created", never "sent"', async () => {
    const r = await invite('new.person@acme.test');
    expect(r.status).toBe(201);
    expect(r.body.invitations[0]).toMatchObject({ email: 'new.person@acme.test', status: 'created' });
    token = r.body.invitations[0].token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const stored = await pool.query(`SELECT token_hash FROM vn_invitations WHERE email = 'new.person@acme.test'`);
    expect(stored.rows[0].token_hash).not.toBe(token);           // only the hash is kept
  });

  it('inviting the same address again renews the link; the old one stops working', async () => {
    const r = await invite('new.person@acme.test', 'admin');
    expect(r.body.invitations[0].status).toBe('renewed');
    const fresh = r.body.invitations[0].token;
    expect((await call('GET', `/invitation/${token}`)).status).toBe(404);
    const p = await call('GET', `/invitation/${fresh}`);
    expect(p.status).toBe(200);
    expect(p.body.invitation).toMatchObject({ email: 'new.person@acme.test', workspace_name: 'Acme', role: 'Admin', invited_by: 'Owner One' });
    expect((await pool.query(`SELECT count(*)::int n FROM vn_invitations WHERE email = 'new.person@acme.test'`)).rows[0].n).toBe(1);
    token = fresh;
  });

  it('an address that already has an account is refused at invite time, with the reason', async () => {
    const r = await invite('owner@other.test');
    expect(r.body.invitations[0]).toMatchObject({ status: 'error' });
    expect(r.body.invitations[0].message).toMatch(/already has a VaNi account/);
    expect(r.body.invitations[0].token).toBeUndefined();
  });

  it('accept: the password rules of signup apply', async () => {
    const r = await call('POST', '/invitation/accept', { token, name: 'New Person', password: 'weak' });
    expect(r.status).toBe(400);
    expect((await pool.query(`SELECT 1 FROM vn_users WHERE email = 'new.person@acme.test'`)).rows).toHaveLength(0);
  });

  it('accept: joins the INVITING workspace with the invited role, under the invitation\'s email, signed in', async () => {
    const r = await call('POST', '/invitation/accept',
      { token, name: 'New Person', password: 'Passw0rdN', email: 'someone.else@evil.test' });
    expect(r.status).toBe(201);
    expect(r.body.tokens.access_token).toBeTruthy();
    expect(r.body.user).toMatchObject({ email: 'new.person@acme.test', role: 'admin' });
    expect(r.body.tenant.id).toBe(ownerTenant);
    const u = await pool.query(`SELECT tenant_id FROM vn_users WHERE email = 'new.person@acme.test'`);
    expect(u.rows[0].tenant_id).toBe(ownerTenant);
    expect((await pool.query(`SELECT 1 FROM vn_users WHERE email = 'someone.else@evil.test'`)).rows).toHaveLength(0);
    expect((await pool.query(`SELECT status FROM vn_invitations WHERE email = 'new.person@acme.test'`)).rows[0].status).toBe('accepted');
  });

  it('the new member signs in normally and is on the owner\'s team', async () => {
    const login = await call('POST', '/login', { email: 'new.person@acme.test', password: 'Passw0rdN' });
    expect(login.status).toBe(200);
    const team = await call('GET', '/team', undefined, ownerToken);
    expect(team.body.members.map((m: any) => m.email)).toEqual(expect.arrayContaining(['owner@acme.test', 'new.person@acme.test']));
  });

  it('a used link says so, and cannot make a second account', async () => {
    expect((await call('GET', `/invitation/${token}`)).body.error.code).toBe('INVITE_USED');
    const again = await call('POST', '/invitation/accept', { token, name: 'Twice', password: 'Passw0rdN' });
    expect(again.status).toBe(410);
  });

  it('an expired link says so', async () => {
    const r = await invite('late@acme.test');
    await pool.query(`UPDATE vn_invitations SET expires_at = now() - interval '1 minute' WHERE email = 'late@acme.test'`);
    const p = await call('GET', `/invitation/${r.body.invitations[0].token}`);
    expect(p.status).toBe(410);
    expect(p.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('two accepts of one link at once make ONE account', async () => {
    const r = await invite('race@acme.test');
    const t = r.body.invitations[0].token;
    const [x, y] = await Promise.all([
      call('POST', '/invitation/accept', { token: t, name: 'Race One', password: 'Passw0rdR' }),
      call('POST', '/invitation/accept', { token: t, name: 'Race Two', password: 'Passw0rdR' }),
    ]);
    expect([x.status, y.status].sort()).toEqual([201, 410]);
    expect((await pool.query(`SELECT count(*)::int n FROM vn_users WHERE email = 'race@acme.test'`)).rows[0].n).toBe(1);
  });

  it('wrong tenant: another workspace never sees this workspace\'s invitations', async () => {
    const r = await call('GET', '/invitations', undefined, otherToken);
    expect(r.body.invitations).toEqual([]);
  });

  it('no token, or an empty body: refused, nothing written', async () => {
    expect((await call('POST', '/invite', { invitations: [] }, ownerToken)).status).toBe(400);
    expect((await call('POST', '/invite', { invitations: [{ email: 'x@acme.test' }] })).status).toBe(401);
    expect((await call('POST', '/invitation/accept', { name: 'No Token', password: 'Passw0rdX' })).status).toBe(400);
  });
});
