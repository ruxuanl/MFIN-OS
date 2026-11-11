-- M7 synthetic monitor heartbeat slice. The public Data API surface stays
-- invoker-only and service-role-only; privileged implementations remain in
-- the non-exposed private schema. This slice deliberately rejects any real UI
-- adapter until the visible-UI/OCR implementation receives its own review.

create function private.get_wechat_monitor_assignment(target_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  state_record public.wechat_monitor_states%rowtype;
  decision record;
  enabled_groups jsonb := '[]'::jsonb;
  privacy_unlocked boolean;
  permission_allowed boolean := false;
  can_run boolean := false;
  block_reason text := 'not_configured';
begin
  if target_user_id is null then
    raise exception 'invalid_wechat_monitor_user' using errcode = '22023';
  end if;

  privacy_unlocked := not exists (
    select 1 from public.privacy_locks
    where user_id = target_user_id and is_locked
  );

  select * into state_record
  from public.wechat_monitor_states
  where user_id = target_user_id;

  if not found then
    return jsonb_build_object(
      'desired_state', 'stopped',
      'observed_state', 'stopped',
      'stop_generation', 0,
      'privacy_unlocked', privacy_unlocked,
      'permission_allowed', false,
      'can_run', false,
      'reason', 'not_configured',
      'groups', enabled_groups
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', groups.id,
        'stable_group_key', groups.stable_group_key,
        'identity_fingerprint', groups.identity_fingerprint,
        'display_label', groups.display_label
      ) order by groups.id
    ),
    '[]'::jsonb
  ) into enabled_groups
  from public.wechat_allowlist_groups as groups
  where groups.user_id = target_user_id and groups.enabled;

  if state_record.desired_state = 'stopped' then
    block_reason := 'stopped';
  elsif state_record.desired_state = 'paused' then
    block_reason := 'user_paused';
  else
    select * into decision
    from private.evaluate_permission(target_user_id, 'wechat.monitor', null);
    permission_allowed := coalesce(decision.allowed, false);

    if not privacy_unlocked then
      block_reason := 'privacy_locked';
    elsif not permission_allowed then
      block_reason := 'permission_denied';
    elsif jsonb_array_length(enabled_groups) = 0 then
      block_reason := 'not_configured';
    else
      can_run := true;
      block_reason := 'healthy';
    end if;
  end if;

  return jsonb_build_object(
    'desired_state', state_record.desired_state,
    'observed_state', state_record.observed_state,
    'stop_generation', state_record.stop_generation,
    'privacy_unlocked', privacy_unlocked,
    'permission_allowed', permission_allowed,
    'can_run', can_run,
    'reason', block_reason,
    'groups', enabled_groups
  );
end;
$$;

create function private.report_wechat_monitor_heartbeat(
  target_user_id uuid,
  target_stop_generation bigint,
  target_observed_state text,
  target_pause_reason text,
  target_last_error_code text,
  target_monitor_version text,
  target_environment_summary jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_record public.wechat_monitor_states%rowtype;
  decision record;
  effective_state text;
  effective_reason text;
  can_continue boolean := false;
begin
  if target_user_id is null
    or target_stop_generation is null
    or target_stop_generation < 0
    or target_observed_state not in ('healthy', 'blocked', 'error')
    or target_monitor_version is null
    or target_monitor_version !~ '^[A-Za-z0-9._+-]{1,80}$'
  then
    raise exception 'invalid_wechat_heartbeat' using errcode = '22023';
  end if;

  if target_pause_reason is not null and target_pause_reason not in (
    'privacy_locked', 'permission_denied', 'session_locked',
    'wechat_logged_out', 'window_unavailable', 'group_identity_uncertain',
    'ui_changed', 'account_risk', 'ocr_failed', 'network_unavailable',
    'heartbeat_expired', 'not_configured'
  ) then
    raise exception 'invalid_wechat_pause_reason' using errcode = '22023';
  end if;
  if (target_observed_state = 'healthy' and (
      target_pause_reason is not null or target_last_error_code is not null
    ))
    or (target_observed_state <> 'healthy' and target_pause_reason is null)
    or (target_observed_state = 'error' and target_last_error_code is null)
    or (target_last_error_code is not null
      and target_last_error_code !~ '^[a-z0-9_.:-]{1,120}$')
  then
    raise exception 'invalid_wechat_heartbeat_shape' using errcode = '22023';
  end if;

  if target_environment_summary is null
    or jsonb_typeof(target_environment_summary) <> 'object'
    or pg_column_size(target_environment_summary) > 4096
  then
    raise exception 'invalid_wechat_environment' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_object_keys(target_environment_summary) as environment_key
    where environment_key not in (
      'adapter_mode', 'windows_version', 'wechat_version',
      'display_scale_percent', 'ocr_runtime'
    )
  )
    or target_environment_summary->>'adapter_mode' is distinct from 'synthetic'
    or ((target_environment_summary ? 'windows_version') and (
      jsonb_typeof(target_environment_summary->'windows_version') <> 'string'
      or length(target_environment_summary->>'windows_version') not between 1 and 120
    ))
    or ((target_environment_summary ? 'wechat_version') and (
      jsonb_typeof(target_environment_summary->'wechat_version') <> 'string'
      or length(target_environment_summary->>'wechat_version') not between 1 and 120
    ))
    or ((target_environment_summary ? 'ocr_runtime') and (
      jsonb_typeof(target_environment_summary->'ocr_runtime') <> 'string'
      or length(target_environment_summary->>'ocr_runtime') not between 1 and 120
    ))
    or ((target_environment_summary ? 'display_scale_percent') and (
      jsonb_typeof(target_environment_summary->'display_scale_percent') <> 'number'
      or (target_environment_summary->>'display_scale_percent')::numeric not between 50 and 500
    ))
  then
    raise exception 'invalid_wechat_environment' using errcode = '22023';
  end if;

  select * into state_record
  from public.wechat_monitor_states
  where user_id = target_user_id
  for update;

  if not found then
    return jsonb_build_object(
      'accepted', false,
      'can_continue', false,
      'reason', 'not_configured',
      'stop_generation', null
    );
  end if;
  if state_record.stop_generation <> target_stop_generation then
    return jsonb_build_object(
      'accepted', false,
      'can_continue', false,
      'reason', 'stale_stop_generation',
      'stop_generation', state_record.stop_generation
    );
  end if;
  if state_record.desired_state <> 'running' then
    return jsonb_build_object(
      'accepted', false,
      'can_continue', false,
      'reason', state_record.desired_state,
      'stop_generation', state_record.stop_generation
    );
  end if;

  select * into decision
  from private.evaluate_permission(target_user_id, 'wechat.monitor', null);

  if not decision.allowed then
    effective_state := 'blocked';
    effective_reason := case
      when decision.reason = 'privacy_locked' then 'privacy_locked'
      else 'permission_denied'
    end;
  elsif not exists (
    select 1 from public.wechat_allowlist_groups
    where user_id = target_user_id and enabled
  ) then
    effective_state := 'blocked';
    effective_reason := 'not_configured';
  else
    effective_state := target_observed_state;
    effective_reason := target_pause_reason;
    can_continue := target_observed_state = 'healthy';
  end if;

  update public.wechat_monitor_states
  set observed_state = effective_state,
      pause_reason = effective_reason,
      last_heartbeat_at = now(),
      last_error_code = case when can_continue then null else target_last_error_code end,
      monitor_version = target_monitor_version,
      environment_summary = target_environment_summary
  where user_id = target_user_id;

  return jsonb_build_object(
    'accepted', true,
    'can_continue', can_continue,
    'reason', case when can_continue then 'healthy' else effective_reason end,
    'stop_generation', state_record.stop_generation
  );
end;
$$;

grant usage on schema private to service_role;
revoke all on function private.get_wechat_monitor_assignment(uuid)
  from public, anon, authenticated;
revoke all on function private.report_wechat_monitor_heartbeat(
  uuid, bigint, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function private.get_wechat_monitor_assignment(uuid)
  to service_role;
grant execute on function private.report_wechat_monitor_heartbeat(
  uuid, bigint, text, text, text, text, jsonb
) to service_role;

create function public.get_wechat_monitor_assignment(target_user_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_wechat_monitor_assignment(target_user_id);
$$;

create function public.report_wechat_monitor_heartbeat(
  target_user_id uuid,
  target_stop_generation bigint,
  target_observed_state text,
  target_pause_reason text,
  target_last_error_code text,
  target_monitor_version text,
  target_environment_summary jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.report_wechat_monitor_heartbeat(
    target_user_id,
    target_stop_generation,
    target_observed_state,
    target_pause_reason,
    target_last_error_code,
    target_monitor_version,
    target_environment_summary
  );
$$;

revoke execute on function public.get_wechat_monitor_assignment(uuid)
  from public, anon, authenticated;
revoke execute on function public.report_wechat_monitor_heartbeat(
  uuid, bigint, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.get_wechat_monitor_assignment(uuid)
  to service_role;
grant execute on function public.report_wechat_monitor_heartbeat(
  uuid, bigint, text, text, text, text, jsonb
) to service_role;
