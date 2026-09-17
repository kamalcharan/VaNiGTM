/**
 * Does the domain step actually make Vara activatable?
 *
 * `readinessChecklist` gates `POST /vara/activate` on three checks, and one of
 * them — `embed_origins` — was satisfiable by no code path in the repo. The
 * column has existed since migration 240; nothing wrote it; so every tenant
 * sat permanently at 2 of 3 and activation refused them all. Nothing failed
 * loudly, because a checklist reporting "not ready" looks exactly like a
 * tenant who has not finished.
 *
 * This runs the REAL step handler against a REAL database and then reads the
 * REAL checklist. A unit test over the normaliser could not have caught the
 * bug, because the normaliser is not where it lived.
 */

import { execSync } from 'child_process';
import { Pool, PoolClient } from 'pg';
import { applyStepPayload } from '../../onboarding/onboarding.routes';
import { readinessChecklist } from '../vara.routes';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const U = 'aaaaaaaa-0000-0000-0000-000000000001';

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

/* Only what these two functions touch. */
const BASE = `
create extension if not exists pgcrypto;
create table vn_tenants (id uuid primary key, slug text unique not null);
create table vn_tenant_profiles (tenant_id uuid primary key, name text,
  display_name text, industry text);
create table vn_users (id uuid primary key, tenant_id uuid not null,
  full_name text, updated_at timestamptz default now());
create table vani_tenant (id uuid primary key default gen_random_uuid(),
  slug text unique not null, name text);
create table vani_tenant_domain (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  domain text not null unique,
  purpose text not null check (purpose in ('candidate','workspace')),
  verified_at timestamptz,
  embed_origins text[] not null default '{}',
  created_at timestamptz not null default now());
create table vani_role_family (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text not null, unique (tenant_id, name));
create table vara_jd (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, family_id uuid, title text not null,
  status text not null default 'draft');
`;

let pool: Pool;
let client: PoolClient;

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS vara_ready_test');
  await admin.query('CREATE DATABASE vara_ready_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'vara_ready_test' });
  await pool.query(BASE);
}, 60000);

afterAll(async () => { if (client) client.release(); if (pool) await pool.end(); });

beforeEach(async () => {
  if (!available) return;
  await pool.query('TRUNCATE vani_tenant_domain, vara_jd, vani_role_family, vani_tenant, vn_users, vn_tenant_profiles, vn_tenants CASCADE');
  await pool.query(`INSERT INTO vn_tenants (id, slug) VALUES ($1,'acme'), ($2,'other')`, [A, B]);
  await pool.query(`INSERT INTO vn_tenant_profiles (tenant_id, name, display_name)
    VALUES ($1,'Acme','Acme'), ($2,'Other','Other')`, [A, B]);
  await pool.query(`INSERT INTO vn_users (id, tenant_id) VALUES ($1,$2)`, [U, A]);
  if (!client) client = await pool.connect();
});

const vani = async (vn: string) =>
  (await client.query(`SELECT vt.id FROM vani_tenant vt JOIN vn_tenants t ON t.slug = vt.slug
                        WHERE t.id = $1`, [vn])).rows[0]?.id as string;

const d = available ? describe : describe.skip;

d('activation readiness', () => {
  it('starts with nothing passing', async () => {
    await applyStepPayload(client, 'vani:domain', A, U,
      { domain: 'careers.acme.io', purpose: 'workspace' });
    const c = await readinessChecklist(client, await vani(A));
    expect(c.ready).toBe(false);
    expect(c.checks.map((x) => x.pass)).toEqual([false, false, false]);
  });

  it('a candidate domain with an origin passes the first two checks', async () => {
    // The regression. Before embed_origins was writable, check 2 could not
    // pass no matter what the tenant did, so ready was unreachable.
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['https://careers.acme.io'],
    });
    const c = await readinessChecklist(client, await vani(A));
    expect(c.checks.find((x) => x.id === 'candidate_domain')!.pass).toBe(true);
    expect(c.checks.find((x) => x.id === 'embed_origins')!.pass).toBe(true);
    expect(c.checks.find((x) => x.id === 'first_jd_published')!.pass).toBe(false);
    expect(c.ready).toBe(false);
  });

  it('reaches ready once a JD is published', async () => {
    const vt = async () => {
      await applyStepPayload(client, 'vani:domain', A, U, {
        domain: 'careers.acme.io', purpose: 'candidate',
        embed_origins: 'careers.acme.io',
      });
      return vani(A);
    };
    const id = await vt();
    await client.query(
      `INSERT INTO vara_jd (tenant_id, title, status) VALUES ($1,'Full Stack Developer','published')`,
      [id]);
    const c = await readinessChecklist(client, id);
    expect(c.ready).toBe(true);
    expect(c.checks.every((x) => x.pass)).toBe(true);
  });

  it('normalises on the way in, so the stored value matches an Origin header', async () => {
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['CAREERS.acme.io/jobs?src=li'],
    });
    const r = await client.query(`SELECT embed_origins FROM vani_tenant_domain`);
    expect(r.rows[0].embed_origins).toEqual(['https://careers.acme.io']);
  });

  it('keeps the allowlist when a resubmit does not mention origins', async () => {
    // The trap: re-running the step to change only the purpose would otherwise
    // empty the allowlist and de-activate Vara with nothing saying why.
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['https://careers.acme.io'],
    });
    await applyStepPayload(client, 'vani:domain', A, U,
      { domain: 'careers.acme.io', purpose: 'candidate' });
    const c = await readinessChecklist(client, await vani(A));
    expect(c.checks.find((x) => x.id === 'embed_origins')!.pass).toBe(true);
  });

  it('clears the allowlist only when asked explicitly', async () => {
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['https://careers.acme.io'],
    });
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate', embed_origins: [],
    });
    const c = await readinessChecklist(client, await vani(A));
    expect(c.checks.find((x) => x.id === 'embed_origins')!.pass).toBe(false);
  });

  it('refuses an http origin rather than allowlisting it', async () => {
    await expect(applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['http://careers.acme.io'],
    })).rejects.toThrow(/must be https/);
    const r = await client.query(`SELECT count(*)::int n FROM vani_tenant_domain`);
    expect(r.rows[0].n).toBe(0);   // nothing written on a refusal
  });

  it("does not let one tenant's readiness be satisfied by another's domain", async () => {
    await applyStepPayload(client, 'vani:domain', A, U, {
      domain: 'careers.acme.io', purpose: 'candidate',
      embed_origins: ['https://careers.acme.io'],
    });
    await applyStepPayload(client, 'vani:domain', B, U,
      { domain: 'other.example.com', purpose: 'workspace' });
    const c = await readinessChecklist(client, await vani(B));
    expect(c.checks.map((x) => x.pass)).toEqual([false, false, false]);
  });
});
