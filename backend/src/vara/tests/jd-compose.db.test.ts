/**
 * Publishing a JD into a family the tenant has already taken.
 *
 * This is the path that broke in production with "Could not publish this JD",
 * and it broke because two correct things met:
 *
 *   - `vara_scoring_config` is append-only. Migration 241 puts a trigger on it
 *     that raises on any UPDATE.
 *   - `/vara/jd/compose` seeded the family's v1 with
 *     `ON CONFLICT (tenant_id, family_id, version) DO UPDATE`.
 *
 * The conflict branch was unreachable while compose was the first thing ever
 * to write a v1 — so it sat there, wrong, from the day it was written. The
 * take step made a v1 exist BEFORE any JD, and the dead branch became the only
 * branch. Every JD published into a taken family raised
 * "table vara_scoring_config is append-only" and rolled back.
 *
 * So this drives the REAL router over HTTP against a REAL database with the
 * REAL triggers. A test that re-implemented the SQL would have been written
 * with DO UPDATE in it and passed.
 */

import { execSync } from 'child_process';
import express from 'express';
import type { AddressInfo } from 'net';
import { Pool } from 'pg';
import { createVaraRouter } from '../vara.routes';
import { signAccessToken } from '../../auth/token.service';

const VN_A = '11111111-1111-1111-1111-111111111111';
const U_A = 'aaaaaaaa-0000-0000-0000-000000000001';

const available = (() => {
  try {
    execSync(`pg_isready -h ${process.env.PGHOST || '/tmp'} -p ${process.env.PGPORT || 55432}`,
      { stdio: 'ignore' });
    return true;
  } catch { return false; }
})();

/**
 * Only what compose touches — but the TRIGGERS are copied verbatim from
 * migrations 240/241, because the triggers are the test.
 */
const BASE = `
create extension if not exists pgcrypto;
create or replace function vani_forbid_mutation() returns trigger language plpgsql as
$fn$ begin raise exception 'table % is append-only (append-only guard)', tg_table_name; end $fn$;
create or replace function set_tenant_context(t uuid) returns void language plpgsql as
$fn$ begin perform set_config('app.current_tenant_id', t::text, true); end $fn$;

create table vn_tenants (id uuid primary key, slug text unique not null);
create table vani_tenant (id uuid primary key default gen_random_uuid(),
  slug text unique not null, name text);
create table vani_user (id uuid primary key default gen_random_uuid(), email text unique);
create table vani_agent (id uuid primary key default gen_random_uuid(),
  code text unique not null, name text);
create table vani_tenant_agent (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id),
  agent_id uuid not null references vani_agent(id),
  status text not null, unique (tenant_id, agent_id));
create table vani_domain_pack (id uuid primary key default gen_random_uuid(),
  code text not null, version int not null default 1, domain text not null,
  payload jsonb not null, published_at timestamptz not null default now(),
  unique (code, version));
create table vani_role_family (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  name text not null, description text, parent_id uuid,
  created_at timestamptz not null default now(), unique (tenant_id, name));
create table vara_scoring_config (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, family_id uuid not null references vani_role_family(id) on delete cascade,
  version int not null, weights jsonb not null, components jsonb not null,
  threshold_default int not null check (threshold_default between 0 and 100),
  created_from uuid, approved_by uuid references vani_user(id),
  created_at timestamptz not null default now(),
  unique (tenant_id, family_id, version));
create table vara_family_profile (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  family_id uuid not null unique references vani_role_family(id) on delete cascade,
  axis_weights jsonb not null default '{"skill":55,"avail":25,"exp":20}',
  default_threshold int not null default 30,
  active_config_id uuid references vara_scoring_config(id),
  created_at timestamptz not null default now());
create table vara_jd (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  family_id uuid not null references vani_role_family(id),
  title text not null, status text not null default 'draft',
  current_version_id uuid, created_by uuid references vani_user(id),
  created_at timestamptz not null default now());
create table vara_jd_version (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, jd_id uuid not null references vara_jd(id) on delete cascade,
  version int not null, facts jsonb not null, must_haves jsonb not null,
  knockouts jsonb not null, threshold int not null,
  created_by uuid references vani_user(id),
  created_at timestamptz not null default now(), unique (jd_id, version));
create table vani_audit_log (id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  agent_id uuid, actor_type text not null, actor_id uuid,
  entity text not null, entity_id uuid not null, action text not null,
  before jsonb, after jsonb, at timestamptz not null default now());

create trigger scoring_config_append_only before update or delete on vara_scoring_config
  for each row execute function vani_forbid_mutation();
create trigger jd_version_append_only before update or delete on vara_jd_version
  for each row execute function vani_forbid_mutation();
`;

let pool: Pool;
let server: ReturnType<express.Express['listen']>;
let origin = '';
let vaniTenantId = '';

const token = () => signAccessToken({
  user_id: U_A, tenant_id: VN_A, email: 'a@example.com',
  role: 'owner', is_live: false, is_admin: true,
});

async function publish(body: unknown, key?: string) {
  const res = await fetch(`${origin}/jd/compose`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() as any };
}

beforeAll(async () => {
  if (!available) return;
  const admin = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'postgres', connectionTimeoutMillis: 2000 });
  await admin.query('DROP DATABASE IF EXISTS jd_compose_test');
  await admin.query('CREATE DATABASE jd_compose_test');
  await admin.end();

  pool = new Pool({ host: process.env.PGHOST || '/tmp',
    port: Number(process.env.PGPORT) || 55432, user: process.env.PGUSER || 'postgres',
    database: 'jd_compose_test' });
  await pool.query(BASE);

  const app = express();
  app.use(express.json());
  app.use('/', createVaraRouter(pool));
  server = app.listen(0);
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 60000);

afterAll(async () => {
  if (server) await new Promise<void>((r) => server.close(() => r()));
  if (pool) await pool.end();
});

beforeEach(async () => {
  if (!available) return;
  await pool.query('truncate vani_audit_log, vara_jd_version, vara_jd, vara_family_profile, '
    + 'vara_scoring_config, vani_role_family, vani_tenant_agent, vani_tenant, vn_tenants, '
    + 'vani_agent, vani_domain_pack cascade');
  await pool.query(`insert into vn_tenants (id, slug) values ($1,'us')`, [VN_A]);
  const t = await pool.query(
    `insert into vani_tenant (slug, name) values ('us','Us') returning id`);
  vaniTenantId = t.rows[0].id;
  await pool.query(`insert into vani_agent (code, name) values ('vara','Vara')`);
});

const d = available ? describe : describe.skip;

/** A family the tenant TOOK: family row + v1 scoring config + profile pointer. */
async function takeFamily(name: string, threshold = 30) {
  const fam = await pool.query(
    `insert into vani_role_family (tenant_id, name, description)
     values ($1, $2, 'pack:talent-x') returning id`, [vaniTenantId, name]);
  const cfg = await pool.query(
    `insert into vara_scoring_config
       (tenant_id, family_id, version, weights, components, threshold_default)
     values ($1, $2, 1, '{"skill":55,"avail":25,"exp":20}'::jsonb,
             '{"musthaves":[{"name":"Theirs","weight":100}]}'::jsonb, $3)
     returning id`, [vaniTenantId, fam.rows[0].id, threshold]);
  await pool.query(
    `insert into vara_family_profile (tenant_id, family_id, default_threshold, active_config_id)
     values ($1, $2, $3, $4)`,
    [vaniTenantId, fam.rows[0].id, threshold, cfg.rows[0].id]);
  return { familyId: fam.rows[0].id as string, configId: cfg.rows[0].id as string };
}

const FACTS = {
  one_liner: 'Owns the service end to end',
  description: 'About the role\n\n- On-call',
  musthaves: [{ name: 'Production ownership', weight: 100 }],
  knockouts: [],
  threshold: 45,
};

d('publishing a JD', () => {
  it('publishes into a family the tenant already took', async () => {
    // THE REGRESSION. Before the fix this answered 500 with the append-only
    // guard, and the tenant lost the JD they had just shaped.
    const { familyId, configId } = await takeFamily('Backend Engineering');

    const r = await publish({ family: 'Backend Engineering', title: 'Senior Backend Engineer', facts: FACTS });
    expect(r.status).toBe(200);
    expect(r.body.version).toBe(1);

    // And the family's own shape is UNTOUCHED: publishing a JD must not
    // re-decide the bar for every future role in the family. That is what
    // update_family_shape is for.
    const cfgs = await pool.query(
      'select id, threshold_default from vara_scoring_config where family_id = $1', [familyId]);
    expect(cfgs.rows).toHaveLength(1);
    expect(cfgs.rows[0].id).toBe(configId);
    expect(cfgs.rows[0].threshold_default).toBe(30);   // not the JD's 45

    const prof = await pool.query(
      'select active_config_id from vara_family_profile where family_id = $1', [familyId]);
    expect(prof.rows[0].active_config_id).toBe(configId);
  });

  it('still seeds v1 for a family nobody has taken', async () => {
    // The control. Without it the fix could be "never write a config" and this
    // suite would not notice the first JD in an ad-hoc family losing its shape.
    const r = await publish({ family: 'Depot Operations', title: 'Depot Supervisor', facts: FACTS });
    expect(r.status).toBe(200);

    const cfg = await pool.query(
      `select sc.version, sc.threshold_default, sc.components
         from vara_scoring_config sc
         join vani_role_family rf on rf.id = sc.family_id
        where rf.name = 'Depot Operations'`);
    expect(cfg.rows).toHaveLength(1);
    expect(cfg.rows[0].version).toBe(1);
    expect(cfg.rows[0].threshold_default).toBe(45);
    expect(cfg.rows[0].components.musthaves[0].name).toBe('Production ownership');
  });

  it('adopts an orphaned v1 rather than dying on it', async () => {
    // A take that wrote the config and failed before pointing the profile at
    // it. DO NOTHING alone would leave scoringConfigId null; the read-back is
    // what makes the next publish recover instead of inheriting the mess.
    const fam = await pool.query(
      `insert into vani_role_family (tenant_id, name) values ($1,'Orphaned') returning id`,
      [vaniTenantId]);
    const cfg = await pool.query(
      `insert into vara_scoring_config (tenant_id, family_id, version, weights, components, threshold_default)
       values ($1,$2,1,'{}'::jsonb,'{}'::jsonb,30) returning id`,
      [vaniTenantId, fam.rows[0].id]);
    await pool.query(
      `insert into vara_family_profile (tenant_id, family_id, default_threshold) values ($1,$2,30)`,
      [vaniTenantId, fam.rows[0].id]);

    const r = await publish({ family: 'Orphaned', title: 'Some Role', facts: FACTS });
    expect(r.status).toBe(200);
    const prof = await pool.query(
      'select active_config_id from vara_family_profile where family_id = $1', [fam.rows[0].id]);
    expect(prof.rows[0].active_config_id).toBe(cfg.rows[0].id);
  });

  it('records the JD edits on the JD, not on the family', async () => {
    const { familyId } = await takeFamily('Backend Engineering');
    await publish({ family: 'Backend Engineering', title: 'Staff Backend Engineer', facts: FACTS });

    const ver = await pool.query(
      `select must_haves, threshold, facts from vara_jd_version limit 1`);
    expect(ver.rows[0].threshold).toBe(45);
    expect(ver.rows[0].must_haves[0].name).toBe('Production ownership');
    // The posting text rides with the scoring contract, in one version.
    expect(ver.rows[0].facts.description).toContain('On-call');

    const fam = await pool.query(
      'select default_threshold from vara_family_profile where family_id = $1', [familyId]);
    expect(fam.rows[0].default_threshold).toBe(30);
  });

  it('a failure says which side failed and names the class', async () => {
    // "Could not publish this JD" was the server's 500 AND the console's
    // fallback for a non-API error, so the toast could not tell them apart.
    const r = await publish({ family: '', title: 'Senior Backend Engineer', facts: FACTS });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('INVALID_INPUT');
    expect(r.body.error.message).not.toBe('Could not publish this JD');
  });

  it('replays a repeated Idempotency-Key instead of publishing twice', async () => {
    await takeFamily('Backend Engineering');
    const key = 'jd-compose-test-key';
    const first = await publish({ family: 'Backend Engineering', title: 'Senior Backend Engineer', facts: FACTS }, key);
    const second = await publish({ family: 'Backend Engineering', title: 'Senior Backend Engineer', facts: FACTS }, key);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.jd_id).toBe(first.body.jd_id);
    const count = await pool.query('select count(*)::int as n from vara_jd');
    expect(count.rows[0].n).toBe(1);
  });
});
