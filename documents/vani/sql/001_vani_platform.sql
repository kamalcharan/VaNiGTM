-- ============================================================================
-- 001_vani_platform.sql
-- VaNi platform spine — NET-NEW. Nothing in VaNiGTM provides these today;
-- this migration creates the platform dependencies every agent (Vara first,
-- Nova next) hangs off. Coexists with legacy VN_/GTM tables; no history
-- is migrated ("let history be history").
--
-- Conventions:
--   * lowercase identifiers, prefix = owner (vani_ platform, vara_ agent)
--   * all ids uuid, all timestamps timestamptz
--   * every tenant-scoped table: tenant_id + RLS policy tenant_isolation
--   * platform artifacts (agent registry, roles catalog, domain packs)
--     carry no tenant_id and no RLS
--   * append-only tables get the vani_forbid_mutation trigger
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Current tenant for RLS. The app sets:  SET app.tenant_id = '<uuid>';
create or replace function vani_current_tenant() returns uuid
language sql stable as
$$ select nullif(current_setting('app.tenant_id', true), '')::uuid $$;

-- Append-only guard: attach BEFORE UPDATE OR DELETE.
create or replace function vani_forbid_mutation() returns trigger
language plpgsql as
$$ begin
     raise exception 'table % is append-only (append-only guard)', tg_table_name;
   end $$;

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------

create table vani_tenant (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  status       text not null default 'active'
               check (status in ('active','suspended')),
  data_region  text not null default 'in',
  created_at   timestamptz not null default now()
);
comment on table vani_tenant is
  'Subscribing organisation. Vikuna itself is a row here (tenant #1) — no code special-case.';

create table vani_tenant_domain (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references vani_tenant(id) on delete cascade,
  domain         text not null unique,
  purpose        text not null check (purpose in ('candidate','workspace')),
  verified_at    timestamptz,
  embed_origins  text[] not null default '{}',
  created_at     timestamptz not null default now()
);
comment on column vani_tenant_domain.embed_origins is
  'Origin allowlist for the tenant-scoped embed token (candidate surfaces on tenant domain).';

create table vani_user (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  auth_ref    uuid,   -- bridge to the existing auth provider (e.g. Supabase auth.users.id)
  status      text not null default 'active' check (status in ('active','disabled')),
  created_at  timestamptz not null default now()
);
comment on table vani_user is
  'Platform identity. Agents never store users. auth_ref bridges to the existing auth stack.';

create table vani_membership (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references vani_tenant(id) on delete cascade,
  user_id        uuid not null references vani_user(id) on delete cascade,
  platform_role  text not null default 'member' check (platform_role in ('admin','member')),
  created_at     timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Agent fabric
-- ---------------------------------------------------------------------------

create table vani_agent (
  id       uuid primary key default gen_random_uuid(),
  code     text not null unique,          -- 'vara', 'nova'
  name     text not null,
  version  text not null default '1.0',
  status   text not null default 'active' check (status in ('active','retired'))
);

create table vani_tenant_agent (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vani_tenant(id) on delete cascade,
  agent_id     uuid not null references vani_agent(id),
  status       text not null default 'provisioned'
               check (status in ('provisioned','activating','live','suspended')),
  activated_at timestamptz,
  gateway_ref  text,                      -- per-agent commercial gateway handle
  unique (tenant_id, agent_id)
);
comment on table vani_tenant_agent is
  'The subscription: tenant x agent. Per-agent commercial gateway hangs here.';

create table vani_agent_role (
  id        uuid primary key default gen_random_uuid(),
  agent_id  uuid not null references vani_agent(id) on delete cascade,
  code      text not null,                -- vara declares: ta | hm | calibration_approver
  name      text not null,
  unique (agent_id, code)
);

create table vani_user_agent_role (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references vani_tenant(id) on delete cascade,
  user_id        uuid not null references vani_user(id) on delete cascade,
  agent_id       uuid not null references vani_agent(id),
  agent_role_id  uuid not null references vani_agent_role(id),
  granted_by     uuid references vani_user(id),
  granted_at     timestamptz not null default now(),
  unique (tenant_id, user_id, agent_id, agent_role_id)
);
comment on table vani_user_agent_role is
  '"Roles filtered per agent" — an HM in Vara can be nothing in Nova.';

-- ---------------------------------------------------------------------------
-- Org context & packs
-- ---------------------------------------------------------------------------

create table vani_role_family (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vani_tenant(id) on delete cascade,
  name         text not null,
  description  text,
  parent_id    uuid references vani_role_family(id),
  created_at   timestamptz not null default now(),
  unique (tenant_id, name)
);
comment on table vani_role_family is
  'Org structure — agent-neutral. Agents extend (vara_family_profile), never modify.';

create table vani_domain_pack (
  id            uuid primary key default gen_random_uuid(),
  code          text not null,
  version       int  not null default 1,
  domain        text not null,            -- technology | sales | healthcare | ...
  payload       jsonb not null,           -- question banks, JD/knockout templates,
                                          -- signal-adapter manifest, vocabulary —
                                          -- namespaced per agent inside the payload
  published_at  timestamptz not null default now(),
  unique (code, version)
);

create table vani_tenant_pack_binding (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references vani_tenant(id) on delete cascade,
  pack_id   uuid not null references vani_domain_pack(id),
  bound_by  uuid references vani_user(id),
  bound_at  timestamptz not null default now(),
  unique (tenant_id, pack_id)
);
comment on table vani_tenant_pack_binding is
  'Industry declared once at the platform lane; each agent activates its namespace of the payload.';

-- ---------------------------------------------------------------------------
-- Shared services
-- ---------------------------------------------------------------------------

create table vani_llm_provider (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references vani_tenant(id) on delete cascade,
  provider_code    text not null,
  credentials_enc  text not null,         -- encrypted at rest; never pooled across tenants
  last_test_at     timestamptz,
  test_status      text not null default 'untested'
                   check (test_status in ('untested','passed','failed')),
  unique (tenant_id, provider_code)
);

create table vani_template (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references vani_tenant(id) on delete cascade,
  agent_id         uuid not null references vani_agent(id),
  code             text not null,         -- ACK-01 INV-01 REJ-01 REJ-02 POOL-01 POOL-02
  channel          text not null check (channel in ('email','whatsapp','sms')),
  body             text not null,
  variables        jsonb not null default '{}',
  provider         text not null default 'msg91',   -- ContractNest MSG91 infra, sender "vani"
  approval_status  text not null default 'draft'
                   check (approval_status in ('draft','pending','approved','rejected')),
  version          int not null default 1,
  unique (tenant_id, agent_id, code, channel, version)
);

create table vani_comms_log (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references vani_tenant(id) on delete cascade,
  agent_id         uuid not null references vani_agent(id),
  template_id      uuid references vani_template(id),
  channel          text not null check (channel in ('email','whatsapp','sms')),
  recipient_ref    text not null,         -- opaque ref, not raw PII (PII lives in vara_candidate_pii)
  ref_entity       text not null,         -- e.g. 'vara_application'
  ref_id           uuid not null,
  provider_msg_id  text,
  status           text not null default 'queued'
                   check (status in ('queued','sent','delivered','failed','opted_out')),
  sent_at          timestamptz not null default now()
);

create table vani_metering_event (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vani_tenant(id) on delete cascade,
  agent_id     uuid not null references vani_agent(id),
  unit_type    text not null check (unit_type in ('candidate_scored','knockout_close')),
  ref_table    text not null,
  ref_id       uuid not null,
  qty          int  not null default 1 check (qty > 0),
  occurred_at  timestamptz not null default now()
);

create table vani_audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references vani_tenant(id) on delete cascade,
  agent_id    uuid references vani_agent(id),         -- null = platform event
  actor_type  text not null check (actor_type in ('human','rule','timer','system')),
                                                      -- "model" is not a legal actor
  actor_id    uuid,
  entity      text not null,
  entity_id   uuid not null,
  action      text not null,
  before      jsonb,
  after       jsonb,
  at          timestamptz not null default now()
);
comment on table vani_audit_log is
  'One audit spine across agents (D3). POLICY: payloads reference ids, never raw PII — '
  'this is what lets DPDP purge leave audit intact.';

-- ---------------------------------------------------------------------------
-- Append-only guards
-- ---------------------------------------------------------------------------

create trigger comms_log_append_only  before update or delete on vani_comms_log
  for each row execute function vani_forbid_mutation();
create trigger metering_append_only   before update or delete on vani_metering_event
  for each row execute function vani_forbid_mutation();
create trigger audit_append_only      before update or delete on vani_audit_log
  for each row execute function vani_forbid_mutation();

-- ---------------------------------------------------------------------------
-- RLS — tenant-scoped tables. Platform artifacts (vani_agent, vani_agent_role,
-- vani_domain_pack) and global identity (vani_user) carry no tenant policy;
-- the operator role connects with BYPASSRLS.
-- ---------------------------------------------------------------------------

alter table vani_tenant enable row level security;
create policy tenant_isolation on vani_tenant
  using (id = vani_current_tenant());

do $$
declare t text;
begin
  foreach t in array array[
    'vani_tenant_domain','vani_membership','vani_tenant_agent','vani_user_agent_role',
    'vani_role_family','vani_tenant_pack_binding','vani_llm_provider',
    'vani_template','vani_comms_log','vani_metering_event','vani_audit_log'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = vani_current_tenant()) '
      'with check (tenant_id = vani_current_tenant())', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Indexes (hot paths)
-- ---------------------------------------------------------------------------

create index idx_comms_ref      on vani_comms_log (ref_entity, ref_id);
create index idx_metering_agg   on vani_metering_event (tenant_id, agent_id, occurred_at);
create index idx_audit_entity   on vani_audit_log (tenant_id, entity, entity_id, at);
create index idx_uar_lookup     on vani_user_agent_role (tenant_id, agent_id, user_id);
