-- M7 control plane: authenticated users can configure only their own hashed
-- allowlist identities and desired monitor state through audited RPCs. Direct
-- browser writes to the underlying tables remain unavailable.

create or replace function public.create_my_wechat_allowlist_group(
  target_stable_group_key text,
  target_identity_fingerprint text,
  target_display_label text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  clean_label text := btrim(target_display_label);
  new_group_id uuid;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.privacy_locks
    where user_id = actor_user_id and is_locked
  ) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_stable_group_key is null
    or target_stable_group_key !~ '^[0-9a-f]{64}$'
    or target_identity_fingerprint is null
    or target_identity_fingerprint !~ '^[0-9a-f]{64}$'
    or clean_label is null
    or length(clean_label) not between 1 and 120
  then
    raise exception 'invalid_wechat_allowlist_group' using errcode = '22023';
  end if;

  insert into public.wechat_allowlist_groups (
    user_id, stable_group_key, identity_fingerprint, display_label, enabled
  ) values (
    actor_user_id, target_stable_group_key, target_identity_fingerprint,
    clean_label, false
  ) returning id into new_group_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    actor_user_id, 'user', 'wechat.allowlist_created', 'wechat_allowlist_group',
    new_group_id::text,
    jsonb_build_object('display_label', clean_label, 'enabled', false),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );

  return new_group_id;
end;
$$;

create or replace function public.set_my_wechat_allowlist_group(
  target_group_id uuid,
  target_display_label text,
  target_enabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  clean_label text := btrim(target_display_label);
  group_record public.wechat_allowlist_groups%rowtype;
  enabled_groups integer;
  next_generation bigint;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_group_id is null
    or target_enabled is null
    or clean_label is null
    or length(clean_label) not between 1 and 120
  then
    raise exception 'invalid_wechat_allowlist_update' using errcode = '22023';
  end if;

  select * into group_record
  from public.wechat_allowlist_groups
  where id = target_group_id and user_id = actor_user_id
  for update;
  if not found then
    raise exception 'wechat_allowlist_group_not_found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.privacy_locks
    where user_id = actor_user_id and is_locked
  ) and (target_enabled or clean_label is distinct from group_record.display_label) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  update public.wechat_allowlist_groups
  set display_label = clean_label, enabled = target_enabled
  where id = group_record.id;

  if group_record.enabled and not target_enabled then
    select count(*) into enabled_groups
    from public.wechat_allowlist_groups
    where user_id = actor_user_id and enabled;

    update public.wechat_monitor_states
    set stop_generation = stop_generation + 1,
        observed_state = case when desired_state = 'running' then 'blocked' else observed_state end,
        pause_reason = case
          when desired_state <> 'running' then pause_reason
          when enabled_groups = 0 then 'not_configured'
          else 'heartbeat_expired'
        end
    where user_id = actor_user_id
    returning stop_generation into next_generation;

    update public.automation_runs
    set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
        cancel_requested_at = now(),
        finished_at = case when status = 'queued' then now() else finished_at end,
        safe_checkpoint = 'wechat_allowlist_disabled',
        last_error_code = 'wechat_allowlist_changed'
    where user_id = actor_user_id
      and capability_key = 'wechat.monitor'
      and status in ('queued', 'running');
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    before_state, after_state, permission_decision, outcome
  ) values (
    actor_user_id, 'user', 'wechat.allowlist_updated', 'wechat_allowlist_group',
    group_record.id::text,
    jsonb_build_object('display_label', group_record.display_label, 'enabled', group_record.enabled),
    jsonb_build_object('display_label', clean_label, 'enabled', target_enabled,
      'stop_generation', next_generation),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );

  return jsonb_build_object(
    'id', group_record.id,
    'display_label', clean_label,
    'enabled', target_enabled,
    'stop_generation', next_generation
  );
end;
$$;

create or replace function public.set_my_wechat_monitor_state(target_state text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  decision record;
  decision_grant_id uuid;
  enabled_group_id uuid;
  state_record public.wechat_monitor_states%rowtype;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_state not in ('running', 'paused', 'stopped') then
    raise exception 'invalid_wechat_monitor_state' using errcode = '22023';
  end if;

  if target_state = 'running' then
    select * into decision
    from private.evaluate_permission(actor_user_id, 'wechat.monitor', null);
    if not decision.allowed then
      raise exception 'wechat_monitor_permission_denied:%', decision.reason using errcode = '42501';
    end if;
    decision_grant_id := decision.grant_id;

    select id into enabled_group_id
    from public.wechat_allowlist_groups
    where user_id = actor_user_id and enabled
    order by id
    limit 1
    for share;
    if enabled_group_id is null then
      raise exception 'wechat_allowlist_empty' using errcode = '42501';
    end if;

    insert into public.wechat_monitor_states (
      user_id, desired_state, observed_state, pause_reason
    ) values (
      actor_user_id, 'running', 'blocked', 'not_configured'
    ) on conflict (user_id) do nothing;

    select * into state_record
    from public.wechat_monitor_states
    where user_id = actor_user_id
    for update;

    update public.wechat_monitor_states
    set desired_state = 'running',
        observed_state = case
          when observed_state = 'healthy'
            and last_heartbeat_at >= now() - interval '2 minutes'
          then 'healthy'
          else 'blocked'
        end,
        pause_reason = case
          when observed_state = 'healthy'
            and last_heartbeat_at >= now() - interval '2 minutes'
          then null
          when last_heartbeat_at is null then 'not_configured'
          else 'heartbeat_expired'
        end
    where user_id = actor_user_id
    returning * into state_record;
  else
    insert into public.wechat_monitor_states (
      user_id, desired_state, observed_state, stop_generation, pause_reason
    ) values (
      actor_user_id, target_state, target_state, 1,
      case when target_state = 'paused' then 'user_paused' else null end
    ) on conflict (user_id) do update set
      desired_state = excluded.desired_state,
      observed_state = excluded.observed_state,
      stop_generation = public.wechat_monitor_states.stop_generation + 1,
      pause_reason = excluded.pause_reason
    returning * into state_record;

    update public.automation_runs
    set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
        cancel_requested_at = now(),
        finished_at = case when status = 'queued' then now() else finished_at end,
        safe_checkpoint = 'wechat_monitor_' || target_state,
        last_error_code = 'wechat_monitor_' || target_state
    where user_id = actor_user_id
      and capability_key = 'wechat.monitor'
      and status in ('queued', 'running');
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    actor_user_id, 'user', 'wechat.monitor_' || target_state,
    'wechat_monitor_state', actor_user_id::text,
    jsonb_build_object(
      'desired_state', state_record.desired_state,
      'observed_state', state_record.observed_state,
      'pause_reason', state_record.pause_reason,
      'stop_generation', state_record.stop_generation
    ),
    jsonb_build_object(
      'source', 'authenticated_rpc',
      'grant_id', decision_grant_id
    ),
    'succeeded'
  );

  return jsonb_build_object(
    'desired_state', state_record.desired_state,
    'observed_state', state_record.observed_state,
    'pause_reason', state_record.pause_reason,
    'stop_generation', state_record.stop_generation
  );
end;
$$;

revoke execute on function public.create_my_wechat_allowlist_group(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.set_my_wechat_allowlist_group(uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_my_wechat_monitor_state(text)
  from public, anon, authenticated;

grant execute on function public.create_my_wechat_allowlist_group(text, text, text)
  to authenticated;
grant execute on function public.set_my_wechat_allowlist_group(uuid, text, boolean)
  to authenticated;
grant execute on function public.set_my_wechat_monitor_state(text)
  to authenticated;
