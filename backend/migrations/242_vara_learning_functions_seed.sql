-- ============================================================================
-- 003_vara_learning_functions_seed.sql
-- Calibration tables, the candidate-history view, the guarded state-transition
-- function, the DPDP purge function, and seed data.
-- Depends on 001 + 002.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Learning
-- ---------------------------------------------------------------------------

create table vara_calibration_signal (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references vani_tenant(id) on delete cascade,
  family_id       uuid not null references vani_role_family(id) on delete cascade,
  application_id  uuid references vara_application(id),
  signal          text not null
                  check (signal in ('rescue','hold','resume','close_now',
                                    'hm_interview','hm_pass','hire','audit_review')),
  actor_id        uuid references vani_user(id),
  payload         jsonb not null default '{}',
  at              timestamptz not null default now()
);

create table vara_calibration_proposal (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references vani_tenant(id) on delete cascade,
  family_id            uuid not null references vani_role_family(id) on delete cascade,
  change               jsonb not null,        -- e.g. {"threshold": {"from":30,"to":27}}
  evidence             jsonb not null,
  confidence           text not null check (confidence in ('low','medium','high')),
  status               text not null default 'proposed'
                       check (status in ('proposed','approved','declined')),
  decided_by           uuid references vani_user(id),
  decided_at           timestamptz,
  resulting_config_id  uuid references vara_scoring_config(id),
  created_at           timestamptz not null default now()
);

alter table vara_scoring_config
  add constraint fk_created_from
  foreign key (created_from) references vara_calibration_proposal(id);

create trigger cal_signal_append_only before update or delete on vara_calibration_signal
  for each row execute function vani_forbid_mutation();

do $$
declare t text;
begin
  foreach t in array array['vara_calibration_signal','vara_calibration_proposal'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = vani_current_tenant()) '
      'with check (tenant_id = vani_current_tenant())', t);
  end loop;
end $$;

create index idx_signal_family on vara_calibration_signal (tenant_id, family_id, at);

-- ---------------------------------------------------------------------------
-- Derived, not stored: candidate history (powers the profile History tab)
-- ---------------------------------------------------------------------------

create view vara_candidate_history as
select
  c.tenant_id,
  c.id                  as candidate_id,
  c.display_name,
  c.pool_tags,
  a.id                  as application_id,
  j.title               as jd_title,
  a.attempt_no,
  a.state,
  s.composite           as latest_score,
  s.config_id           as scored_under_config,
  s.created_at          as scored_at,
  a.close_reason_code,
  a.closed_by_type,
  a.closed_at,
  a.created_at          as applied_at
from vara_candidate c
join vara_application a on a.candidate_id = c.id
join vara_jd j          on j.id = a.jd_id
left join lateral (
  select composite, config_id, created_at
  from vara_score_snapshot s
  where s.application_id = a.id
  order by s.created_at desc
  limit 1
) s on true;

-- ---------------------------------------------------------------------------
-- Guarded state transition — THE way vara_application.state changes.
-- Enforces the Flow D2 edges, the actor rules ("model" is not an actor;
-- rules only knockout; timers only expire windows), and writes the audit
-- row in the same transaction.
-- ---------------------------------------------------------------------------

create or replace function vara_transition(
  p_application  uuid,
  p_new_state    text,
  p_actor_type   text,                    -- human | rule | timer | system
  p_actor        uuid default null,
  p_reason_code  text default null,
  p_reason       text default null
) returns void
language plpgsql as
$$
declare
  v_app    vara_application%rowtype;
  v_agent  uuid;
  v_edge   boolean;
begin
  select id into v_agent from vani_agent where code = 'vara';

  select * into v_app from vara_application where id = p_application for update;
  if not found then
    raise exception 'application % not found', p_application;
  end if;

  -- Legal edges (Flow D2)
  v_edge := case
    when v_app.state = 'applied'  and p_new_state in ('knockout_closed','scored')            then true
    when v_app.state = 'scored'   and p_new_state in ('closing','handover')                  then true
    when v_app.state = 'closing'  and p_new_state in ('held','handover','closed')            then true
    when v_app.state = 'held'     and p_new_state in ('closing','handover')                  then true
    when v_app.state = 'handover' and p_new_state in ('advanced','closing','closed')         then true
    when v_app.state = 'advanced' and p_new_state in ('handover','closed','hired')           then true
    else false
  end;
  if not v_edge then
    raise exception 'illegal transition % -> % (application %)',
      v_app.state, p_new_state, p_application;
  end if;

  -- Actor rules: a model score is never an actor.
  if p_actor_type not in ('human','rule','timer','system') then
    raise exception 'illegal actor_type % — "model" is not a legal actor', p_actor_type;
  end if;
  if p_actor_type = 'rule'  and not (v_app.state = 'applied' and p_new_state = 'knockout_closed') then
    raise exception 'actor "rule" may only close on knockouts (applied -> knockout_closed)';
  end if;
  if p_actor_type = 'timer' and not (v_app.state = 'closing' and p_new_state = 'closed') then
    raise exception 'actor "timer" may only expire closing windows (closing -> closed)';
  end if;
  if p_actor_type = 'system' and p_new_state in ('closed','knockout_closed','hired','advanced') then
    raise exception 'actor "system" may only route (score / window entry), never decide';
  end if;

  -- Apply
  update vara_application set
    state             = p_new_state,
    held_by           = case when p_new_state = 'held' then p_actor else held_by end,
    held_at           = case when p_new_state = 'held' then now() else held_at end,
    advanced_by       = case when p_new_state = 'advanced' then p_actor else advanced_by end,
    advanced_at       = case when p_new_state = 'advanced' then now() else advanced_at end,
    closed_by_type    = case when p_new_state in ('closed','knockout_closed')
                             then p_actor_type else closed_by_type end,
    closed_by         = case when p_new_state in ('closed','knockout_closed')
                             then p_actor else closed_by end,
    close_reason_code = case when p_new_state in ('closed','knockout_closed')
                             then coalesce(p_reason_code, close_reason_code) end,
    decision_reason   = case when p_new_state in ('closed','knockout_closed','hired')
                             then coalesce(p_reason, decision_reason) else decision_reason end,
    closed_at         = case when p_new_state in ('closed','knockout_closed')
                             then now() else closed_at end,
    window_expires_at = case when p_new_state = 'closing' and v_app.state <> 'held'
                             then now() + make_interval(days =>
                                  (select jv.window_days from vara_jd_version jv
                                   where jv.id = v_app.jd_version_id))
                             else window_expires_at end
  where id = p_application;

  -- Audit in the same transaction — the transition IS the audit event.
  insert into vani_audit_log
    (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, before, after)
  values
    (v_app.tenant_id, v_agent, p_actor_type, p_actor, 'vara_application', p_application,
     'transition',
     jsonb_build_object('state', v_app.state),
     jsonb_build_object('state', p_new_state,
                        'reason_code', p_reason_code, 'reason', p_reason));

  -- Knockout closes meter at the reduced unit.
  if p_new_state = 'knockout_closed' then
    insert into vani_metering_event (tenant_id, agent_id, unit_type, ref_table, ref_id)
    values (v_app.tenant_id, v_agent, 'knockout_close', 'vara_application', p_application);
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- DPDP purge — the single sanctioned bypass of the append-only guards.
-- Deletes PII + artifacts + extractions, blanks chat content, redacts the
-- candidate skeleton. Scores, states and audit survive (no PII by policy).
-- ---------------------------------------------------------------------------

create or replace function vara_purge_candidate(p_candidate uuid)
returns void
language plpgsql
security definer
set search_path = public
as
$$
declare
  v_tenant uuid;
  v_agent  uuid;
begin
  select tenant_id into v_tenant from vara_candidate where id = p_candidate;
  if not found then
    raise exception 'candidate % not found', p_candidate;
  end if;
  select id into v_agent from vani_agent where code = 'vara';

  -- Disable user triggers (append-only guards) for this transaction only.
  set local session_replication_role = replica;

  delete from vara_candidate_pii where candidate_id = p_candidate;
  delete from vara_extraction
    where artifact_id in (select id from vara_artifact where candidate_id = p_candidate);
  delete from vara_artifact where candidate_id = p_candidate;
  update vara_chat_turn set content = '[purged]'
    where application_id in
      (select id from vara_application where candidate_id = p_candidate);
  update vara_candidate
     set display_name = 'Redacted', pool_tags = '{}', retention_until = null
   where id = p_candidate;

  set local session_replication_role = default;

  insert into vani_audit_log
    (tenant_id, agent_id, actor_type, actor_id, entity, entity_id, action, after)
  values
    (v_tenant, v_agent, 'system', null, 'vara_candidate', p_candidate,
     'dpdp_purge', jsonb_build_object('purged', true));
end
$$;

-- ---------------------------------------------------------------------------
-- Seed — agent registry, Vara's role catalog, Vikuna as tenant #1
-- ---------------------------------------------------------------------------

insert into vani_agent (code, name, version) values
  ('vara', 'Vara — the chosen one · VaNi Talent', '1.0')
on conflict (code) do nothing;

insert into vani_agent_role (agent_id, code, name)
select a.id, r.code, r.name
from vani_agent a,
     (values ('ta','Talent Acquisition'),
             ('hm','Hiring Manager'),
             ('calibration_approver','Calibration Approver')) as r(code, name)
where a.code = 'vara'
on conflict (agent_id, code) do nothing;

-- Vikuna: tenant #1 — a real row, no code special-case.
insert into vani_tenant (slug, name, data_region)
values ('vikuna', 'Vikuna Technologies', 'in')
on conflict (slug) do nothing;

insert into vani_tenant_domain (tenant_id, domain, purpose, embed_origins)
select t.id, 'careers.vikuna.io', 'candidate', array['https://vikuna.io','https://careers.vikuna.io']
from vani_tenant t where t.slug = 'vikuna'
on conflict (domain) do nothing;

insert into vani_tenant_agent (tenant_id, agent_id, status)
select t.id, a.id, 'provisioned'
from vani_tenant t, vani_agent a
where t.slug = 'vikuna' and a.code = 'vara'
on conflict (tenant_id, agent_id) do nothing;
