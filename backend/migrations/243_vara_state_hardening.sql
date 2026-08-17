-- ============================================================================
-- Migration 243: make "state changes only through vara_transition()" structural
--
-- The Vara data model (v1.0, Section 3) names two policies to "enforce in code
-- review". This migration promotes the second one into the database itself:
--
--   ② vara_application.state changes only through vara_transition() — grant no
--      direct UPDATE on the state column to the app role.
--
-- Review of the delivered DDL showed why code review is not enough: with the
-- blanket grant a careless setup would write (GRANT ... UPDATE ON ALL TABLES),
-- a plain `UPDATE vara_application SET state='hired'` succeeded as a non-owner
-- role — no edge validation, no audit row, no actor check. That is the one way
-- the product's central invariant ("rules reject, models rank, humans decide")
-- could be silently defeated.
--
-- The guard is a trigger, not a REVOKE, deliberately:
--   - it binds to the column, not to a role, so it survives a future grant
--     being widened by accident;
--   - it applies to the table owner and superuser too (triggers fire for
--     everyone; RLS and grants do not).
--
-- vara_transition() authorises itself by setting a transaction-local flag
-- immediately before its internal UPDATE and clearing it immediately after,
-- so the window is one statement wide. Everything else that touches
-- vara_application (timers/holds metadata via the function, other columns
-- directly) is unaffected — only a change of `state` outside the function
-- raises.
--
-- Depends on: 241 (vara_application), 242 (vara_transition).
-- ============================================================================

-- ── The guard ───────────────────────────────────────────────────────────────

create or replace function vara_guard_state_change()
returns trigger
language plpgsql
as $$
begin
  if new.state is distinct from old.state
     and coalesce(current_setting('vara.state_change_ok', true), '') <> 'on' then
    raise exception
      'vara_application.state changes only through vara_transition() — direct UPDATE of state is forbidden (application %)',
      old.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_vara_guard_state_change on vara_application;
create trigger trg_vara_guard_state_change
  before update on vara_application
  for each row
  execute function vara_guard_state_change();

comment on function vara_guard_state_change is
  'Rejects any UPDATE that changes vara_application.state unless the transaction-local flag vara.state_change_ok is set — which only vara_transition() does, for exactly one statement. Binds the invariant to the column rather than a role, so it survives widened grants and applies to owner/superuser alike.';

-- ── vara_transition, re-created with the authorisation flag ────────────────
-- Identical to 242's version except for the two set_config lines around the
-- internal UPDATE. Signature unchanged.

create or replace function vara_transition(
  p_application uuid,
  p_new_state   text,
  p_actor_type  text,
  p_actor       uuid default null,
  p_reason_code text default null,
  p_reason      text default null
)
returns void
language plpgsql
as $$
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

  -- Authorise exactly this one UPDATE for the state-guard trigger (243).
  perform set_config('vara.state_change_ok', 'on', true);

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

  -- Close the window immediately — the flag lives for one statement only.
  perform set_config('vara.state_change_ok', '', true);

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
end;
$$;
