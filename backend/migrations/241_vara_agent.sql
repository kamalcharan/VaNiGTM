-- ============================================================================
-- 002_vara_agent.sql
-- Vara agent tables. Depends on 001 (vani_ platform spine).
-- Everything here is tenant-scoped under RLS. Activating Vara adds rows;
-- deactivating removes them; nothing in vani_ changes either way.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Config
-- ---------------------------------------------------------------------------

create table vara_family_profile (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references vani_tenant(id) on delete cascade,
  family_id          uuid not null unique references vani_role_family(id) on delete cascade,
  axis_weights       jsonb not null default '{"skill":55,"avail":25,"exp":20}',
  default_threshold  int  not null default 30 check (default_threshold between 0 and 100),
  active_config_id   uuid,   -- fk added below, after vara_scoring_config exists
  created_at         timestamptz not null default now()
);
comment on table vara_family_profile is
  'D6: 1:1 talent overlay on vani_role_family. Definition is the org''s; talent behaviour is Vara''s.';

create table vara_scoring_config (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references vani_tenant(id) on delete cascade,
  family_id          uuid not null references vani_role_family(id) on delete cascade,
  version            int  not null,
  weights            jsonb not null,
  components         jsonb not null,
  threshold_default  int  not null check (threshold_default between 0 and 100),
  created_from       uuid,   -- fk to vara_calibration_proposal added in 003
  approved_by        uuid references vani_user(id),
  created_at         timestamptz not null default now(),
  unique (tenant_id, family_id, version)
);

alter table vara_family_profile
  add constraint fk_active_config
  foreign key (active_config_id) references vara_scoring_config(id);

-- ---------------------------------------------------------------------------
-- Definition
-- ---------------------------------------------------------------------------

create table vara_jd (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references vani_tenant(id) on delete cascade,
  family_id           uuid not null references vani_role_family(id),
  title               text not null,
  status              text not null default 'draft'
                      check (status in ('draft','published','closed')),
  current_version_id  uuid,   -- fk added below (circular with vara_jd_version)
  created_by          uuid references vani_user(id),
  created_at          timestamptz not null default now()
);

create table vara_jd_version (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references vani_tenant(id) on delete cascade,
  jd_id                  uuid not null references vara_jd(id) on delete cascade,
  version                int  not null,
  facts                  jsonb not null default '{}',   -- band, location, team...
  must_haves             jsonb not null default '[]',   -- weighted; nice-to-have flagged
  knockouts              jsonb not null default '[]',   -- deterministic expressions
  threshold              int  not null check (threshold between 0 and 100),
  window_days            int  not null default 3  check (window_days >= 0),
  reapply_cooldown_days  int  not null default 90 check (reapply_cooldown_days >= 0),
  created_by             uuid references vani_user(id),
  created_at             timestamptz not null default now(),
  unique (jd_id, version)
);
comment on table vara_jd_version is
  'Immutable. Applications pin the version that scored them; edits create versions.';

alter table vara_jd
  add constraint fk_current_version
  foreign key (current_version_id) references vara_jd_version(id);

-- ---------------------------------------------------------------------------
-- People — the talent pool
-- ---------------------------------------------------------------------------

create table vara_candidate (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references vani_tenant(id) on delete cascade,
  display_name        text not null,
  pool_tags           text[] not null default '{}',   -- silver_medalist, future_fit...
  current_consent_id  uuid,   -- fk added below, after vara_consent exists
  retention_until     date,
  created_at          timestamptz not null default now()
);
comment on table vara_candidate is
  'Durable person, alive across JDs and years. Strictly per-tenant; never matched across tenants.';

create table vara_candidate_pii (
  candidate_id  uuid primary key references vara_candidate(id) on delete cascade,
  tenant_id     uuid not null references vani_tenant(id) on delete cascade,
  email         text,
  phone         text,
  whatsapp      text,
  location      text,
  links         jsonb not null default '{}'
);
comment on table vara_candidate_pii is
  'D4: DPDP purge deletes this row; skeleton, scores and audit survive (audit holds no PII by policy).';

create table vara_consent (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references vani_tenant(id) on delete cascade,
  candidate_id     uuid not null references vara_candidate(id) on delete cascade,
  consent_version  text not null,
  granted_at       timestamptz not null default now(),
  channel          text not null,
  withdrawn_at     timestamptz
);

alter table vara_candidate
  add constraint fk_current_consent
  foreign key (current_consent_id) references vara_consent(id);

-- ---------------------------------------------------------------------------
-- Pursuit
-- ---------------------------------------------------------------------------

create table vara_application (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references vani_tenant(id) on delete cascade,
  candidate_id       uuid not null references vara_candidate(id) on delete cascade,
  jd_id              uuid not null references vara_jd(id) on delete cascade,
  jd_version_id      uuid not null references vara_jd_version(id),
  attempt_no         int  not null default 1 check (attempt_no >= 1),
  state              text not null default 'applied'
                     check (state in ('applied','knockout_closed','scored','closing',
                                      'held','handover','advanced','closed','hired')),
  window_expires_at  timestamptz,
  held_by            uuid references vani_user(id),
  held_at            timestamptz,
  advanced_by        uuid references vani_user(id),
  advanced_at        timestamptz,
  closed_by_type     text check (closed_by_type in ('human','rule','timer')),
  closed_by          uuid,
  close_reason_code  text,     -- knockout:<rule_id> | below_threshold | hm_pass | withdrew
  decision_reason    text,
  closed_at          timestamptz,
  created_at         timestamptz not null default now(),
  unique (candidate_id, jd_id, attempt_no),
  -- D7: a close is a state + these columns + audit + comms rows. Closed rows must say who/how.
  check (state not in ('closed','knockout_closed') or closed_by_type is not null)
);

create table vara_artifact (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references vani_tenant(id) on delete cascade,
  candidate_id  uuid not null references vara_candidate(id) on delete cascade,
  application_id uuid references vara_application(id),
  adapter       text not null
                check (adapter in ('docx','pdf','linkedin_export','github_api','url','csv')),
  kind          text not null default 'resume',
  storage_ref   text not null,
  content_hash  text not null,
  provided_at   timestamptz not null default now()
);
comment on table vara_artifact is 'Raw before parsed, always. Candidate-provided only — no scraping.';

create table vara_extraction (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references vani_tenant(id) on delete cascade,
  artifact_id        uuid not null references vara_artifact(id) on delete cascade,
  extractor_version  text not null,
  fields             jsonb not null,   -- per field: value, evidence span, confidence
  status             text not null default 'ok'
                     check (status in ('ok','low_confidence','rejected')),
  created_at         timestamptz not null default now()
);

create table vara_chat_turn (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references vani_tenant(id) on delete cascade,
  application_id     uuid not null references vara_application(id) on delete cascade,
  turn_no            int  not null,
  speaker            text not null check (speaker in ('vara','candidate')),
  content            text not null,
  maps_to_component  text,
  created_at         timestamptz not null default now(),
  unique (application_id, turn_no)
);
comment on table vara_chat_turn is 'D5: evidence cites turn_id, not offsets in a transcript blob.';

create table vara_score_snapshot (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references vani_tenant(id) on delete cascade,
  application_id  uuid not null references vara_application(id) on delete cascade,
  config_id       uuid not null references vara_scoring_config(id),
  composite       int  not null check (composite between 0 and 100),
  axes            jsonb not null,   -- per component: score, weight, evidence refs (turn_id | artifact_id)
  flags_count     int  not null default 0,
  created_at      timestamptz not null default now()
);

create table vara_flag (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references vani_tenant(id) on delete cascade,
  application_id  uuid not null references vara_application(id) on delete cascade,
  kind            text not null default 'consistency',
  source_a        jsonb not null,   -- verbatim
  source_b        jsonb not null,   -- verbatim
  status          text not null default 'open'
                  check (status in ('open','discussed','dismissed')),
  raised_at       timestamptz not null default now()
);
comment on table vara_flag is 'Human-facing contradictions. Never feeds the composite.';

-- ---------------------------------------------------------------------------
-- Metering hook: writing a snapshot IS the metering event (Section 3 of spec)
-- ---------------------------------------------------------------------------

create or replace function vara_emit_metering() returns trigger
language plpgsql as
$$
begin
  insert into vani_metering_event (tenant_id, agent_id, unit_type, ref_table, ref_id)
  select new.tenant_id, a.id, 'candidate_scored', 'vara_score_snapshot', new.id
  from vani_agent a where a.code = 'vara';
  return new;
end
$$;

create trigger snapshot_meters after insert on vara_score_snapshot
  for each row execute function vara_emit_metering();

-- ---------------------------------------------------------------------------
-- Append-only / immutability guards
-- ---------------------------------------------------------------------------

create trigger scoring_config_append_only before update or delete on vara_scoring_config
  for each row execute function vani_forbid_mutation();
create trigger jd_version_append_only     before update or delete on vara_jd_version
  for each row execute function vani_forbid_mutation();
create trigger artifact_append_only       before update or delete on vara_artifact
  for each row execute function vani_forbid_mutation();
create trigger snapshot_append_only       before update or delete on vara_score_snapshot
  for each row execute function vani_forbid_mutation();
create trigger chat_turn_append_only      before update or delete on vara_chat_turn
  for each row execute function vani_forbid_mutation();
-- vara_consent: withdrawal updates withdrawn_at, so consent is delete-protected only.
create or replace function vani_forbid_delete() returns trigger
language plpgsql as
$$ begin raise exception 'table % is delete-protected', tg_table_name; end $$;
create trigger consent_no_delete before delete on vara_consent
  for each row execute function vani_forbid_delete();

-- NOTE: the DPDP purge function (003) is the single sanctioned bypass of these
-- guards, via SECURITY DEFINER + session_replication_role = replica.

-- ---------------------------------------------------------------------------
-- RLS — every vara_ table
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'vara_family_profile','vara_scoring_config','vara_jd','vara_jd_version',
    'vara_candidate','vara_candidate_pii','vara_consent','vara_application',
    'vara_artifact','vara_extraction','vara_chat_turn','vara_score_snapshot','vara_flag'
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

create index idx_app_jd_state    on vara_application (tenant_id, jd_id, state);
create index idx_app_candidate   on vara_application (tenant_id, candidate_id);
create index idx_app_timer_sweep on vara_application (window_expires_at) where state = 'closing';
create index idx_snapshot_latest on vara_score_snapshot (application_id, created_at desc);
create index idx_chat_app        on vara_chat_turn (application_id);
create index idx_candidate_tags  on vara_candidate using gin (pool_tags);
create index idx_pii_email       on vara_candidate_pii (tenant_id, email);
create index idx_artifact_cand   on vara_artifact (tenant_id, candidate_id);
