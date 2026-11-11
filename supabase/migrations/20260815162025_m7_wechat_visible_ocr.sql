-- M7 real visible-UI adapter. The trusted local companion can pair only the
-- currently visible group into a disabled allowlist row. Runtime heartbeats
-- explicitly attest that keyboard, clipboard, and WeChat send capabilities
-- are absent. No message text is accepted by the pairing path.

alter table public.wechat_monitor_states
  drop constraint wechat_monitor_states_pause_reason_check;
alter table public.wechat_monitor_states
  add constraint wechat_monitor_states_pause_reason_check check (
    pause_reason is null or pause_reason in (
      'user_paused', 'privacy_locked', 'permission_denied', 'session_locked',
      'user_active', 'wechat_logged_out', 'window_unavailable',
      'group_identity_uncertain', 'ui_changed', 'account_risk', 'ocr_failed',
      'network_unavailable', 'heartbeat_expired', 'not_configured'
    )
  );

create function private.pair_wechat_visible_group(
  target_user_id uuid,
  target_stable_group_key text,
  target_identity_fingerprint text,
  target_display_label text,
  target_wechat_version text
)
returns table (group_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_label text := btrim(target_display_label);
  existing_group public.wechat_allowlist_groups%rowtype;
begin
  if target_user_id is null
    or target_stable_group_key !~ '^[0-9a-f]{64}$'
    or target_identity_fingerprint !~ '^[0-9a-f]{64}$'
    or clean_label is null
    or length(clean_label) not between 1 and 120
    or target_wechat_version !~ '^[0-9.]{1,40}$'
  then
    raise exception 'invalid_wechat_visible_pairing' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'wechat_pairing_user_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.privacy_locks
    where user_id = target_user_id and is_locked
  ) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  select * into existing_group
  from public.wechat_allowlist_groups
  where user_id = target_user_id and stable_group_key = target_stable_group_key
  for update;

  if found then
    if existing_group.identity_fingerprint <> target_identity_fingerprint then
      raise exception 'wechat_pairing_identity_conflict' using errcode = '23505';
    end if;
    return query select existing_group.id, false;
    return;
  end if;

  insert into public.wechat_allowlist_groups (
    user_id, stable_group_key, identity_fingerprint, display_label, enabled
  ) values (
    target_user_id, target_stable_group_key, target_identity_fingerprint,
    clean_label, false
  ) returning id into group_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'wechat.visible_group_paired',
    'wechat_allowlist_group', group_id::text,
    jsonb_build_object(
      'display_label', clean_label,
      'enabled', false,
      'wechat_version', target_wechat_version,
      'identity_mode', 'visible_title_v1'
    ),
    jsonb_build_object(
      'source', 'trusted_local_companion',
      'keyboard_input', false,
      'clipboard_access', false,
      'send_capability', false
    ),
    'succeeded'
  );

  return query select group_id, true;
end;
$$;

revoke execute on function private.pair_wechat_visible_group(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function private.pair_wechat_visible_group(uuid, text, text, text, text)
  to service_role;

create function public.pair_wechat_visible_group(
  target_user_id uuid,
  target_stable_group_key text,
  target_identity_fingerprint text,
  target_display_label text,
  target_wechat_version text
)
returns table (group_id uuid, created boolean)
language sql
volatile
security invoker
set search_path = ''
as $$
  select * from private.pair_wechat_visible_group(
    target_user_id,
    target_stable_group_key,
    target_identity_fingerprint,
    target_display_label,
    target_wechat_version
  );
$$;

revoke execute on function public.pair_wechat_visible_group(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.pair_wechat_visible_group(uuid, text, text, text, text)
  to service_role;

create or replace function private.report_wechat_monitor_heartbeat(
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
  adapter_mode text;
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
    'privacy_locked', 'permission_denied', 'session_locked', 'user_active',
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
  adapter_mode := target_environment_summary->>'adapter_mode';
  if exists (
    select 1 from jsonb_object_keys(target_environment_summary) as environment_key
    where environment_key not in (
      'adapter_mode', 'windows_version', 'wechat_version',
      'display_scale_percent', 'ocr_runtime', 'interaction_mode',
      'keyboard_input', 'clipboard_access', 'send_capability'
    )
  )
    or adapter_mode not in ('synthetic', 'visible_ocr_v1')
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
    or (adapter_mode = 'visible_ocr_v1' and (
      target_monitor_version <> 'm7-visible-ocr-v1'
      or target_environment_summary->>'ocr_runtime' is distinct from 'windows.media.ocr'
      or target_environment_summary->>'interaction_mode' is distinct from 'visible_list_mouse_only'
      or jsonb_typeof(target_environment_summary->'keyboard_input') is distinct from 'boolean'
      or (target_environment_summary->>'keyboard_input')::boolean
      or jsonb_typeof(target_environment_summary->'clipboard_access') is distinct from 'boolean'
      or (target_environment_summary->>'clipboard_access')::boolean
      or jsonb_typeof(target_environment_summary->'send_capability') is distinct from 'boolean'
      or (target_environment_summary->>'send_capability')::boolean
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
