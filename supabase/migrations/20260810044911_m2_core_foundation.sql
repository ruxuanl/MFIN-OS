-- M2: core data, permissions, audit, undo, and durable automation foundation.
-- All browser-reachable tables use explicit grants plus owner-scoped RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.capability_definitions (
  capability_key text primary key,
  category text not null,
  label text not null,
  description text not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  requires_ai boolean not null default false,
  supports_once boolean not null default true,
  supports_timed boolean not null default true,
  connection_provider text,
  requires_reverification boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint capability_key_format check (capability_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint forbidden_capability_keys check (
    capability_key <> all (array[
      'gmail.send', 'gmail.forward', 'gmail.reply', 'wechat.send',
      'contacts.contact', 'job.apply', 'application.submit',
      'offer.accept', 'offer.reject', 'recruiting_profile.update'
    ])
  )
);

create table public.capability_dependencies (
  capability_key text not null references public.capability_definitions(capability_key) on delete cascade,
  required_capability_key text not null references public.capability_definitions(capability_key) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (capability_key, required_capability_key),
  constraint no_self_dependency check (capability_key <> required_capability_key)
);

create table private.secret_references (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  secret_name text not null,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  disabled_at timestamptz,
  unique (user_id, provider, secret_name)
);

revoke all on private.secret_references from public, anon, authenticated;

create table public.external_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  status text not null default 'disconnected' check (status in ('disconnected', 'connecting', 'connected', 'paused', 'error')),
  granted_scopes text[] not null default '{}',
  secret_reference_id uuid references private.secret_references(id) on delete set null,
  last_success_at timestamptz,
  last_error_code text,
  last_error_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.permission_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_key text not null references public.capability_definitions(capability_key) on delete restrict,
  mode text not null default 'off' check (mode in ('off', 'once', 'temporary', 'persistent')),
  operation_id uuid,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, capability_key),
  constraint permission_mode_shape check (
    (mode = 'off' and operation_id is null and expires_at is null)
    or (mode = 'once' and operation_id is not null)
    or (mode = 'temporary' and operation_id is null and expires_at is not null and expires_at > starts_at)
    or (mode = 'persistent' and operation_id is null and expires_at is null)
  )
);

create table public.privacy_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  is_locked boolean not null default false,
  reason_code text,
  locked_at timestamptz,
  unlocked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint privacy_lock_timestamps check (
    (is_locked and locked_at is not null)
    or (not is_locked)
  )
);

create table public.evidence_refs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null,
  source_locator text,
  content_hash text,
  summary text,
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint evidence_summary_is_excerpt check (summary is null or length(summary) <= 1000),
  constraint evidence_locator_size check (source_locator is null or length(source_locator) <= 2048)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trace_id uuid not null default gen_random_uuid(),
  operation_id uuid,
  actor_type text not null check (actor_type in ('user', 'ai', 'sync', 'scheduler', 'system', 'recovery')),
  action text not null,
  object_type text not null,
  object_id text,
  before_state jsonb,
  after_state jsonb,
  permission_decision jsonb,
  rule_version text,
  confidence numeric(5,4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  outcome text not null check (outcome in ('succeeded', 'failed', 'cancelled', 'partial')),
  error_code text,
  reversible boolean not null default false,
  undo_deadline timestamptz,
  created_at timestamptz not null default now(),
  constraint audit_payload_size check (
    coalesce(pg_column_size(before_state), 0) +
    coalesce(pg_column_size(after_state), 0) +
    coalesce(pg_column_size(permission_decision), 0) <= 65536
  )
);

create table public.audit_event_evidence (
  audit_event_id uuid not null references public.audit_events(id) on delete cascade,
  evidence_id uuid not null references public.evidence_refs(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (audit_event_id, evidence_id)
);

create table public.field_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_type text not null,
  object_id text not null,
  field_path text not null,
  reason text,
  locked_at timestamptz not null default now(),
  unlocked_at timestamptz,
  created_at timestamptz not null default now(),
  unique nulls not distinct (user_id, object_type, object_id, field_path, unlocked_at)
);

create table public.undo_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  audit_event_id uuid not null references public.audit_events(id) on delete restrict,
  operation_type text not null,
  compensation_payload jsonb not null default '{}',
  status text not null default 'available' check (status in ('available', 'running', 'succeeded', 'failed', 'expired')),
  expires_at timestamptz,
  attempted_at timestamptz,
  completed_at timestamptz,
  error_code text,
  result_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint undo_payload_size check (pg_column_size(compensation_payload) <= 32768),
  constraint undo_result_size check (result_summary is null or length(result_summary) <= 1000)
);

create table public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_key text not null references public.capability_definitions(capability_key) on delete restrict,
  permission_grant_id uuid references public.permission_grants(id) on delete set null,
  operation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'cancel_requested', 'cancelled', 'succeeded', 'failed', 'dead_letter')),
  progress smallint not null default 0 check (progress between 0 and 100),
  safe_checkpoint text,
  permission_snapshot jsonb not null default '{}',
  input_reference jsonb not null default '{}',
  result_reference jsonb,
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz,
  cancel_requested_at timestamptz,
  last_error_code text,
  last_error_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  constraint automation_reference_size check (
    pg_column_size(permission_snapshot) + pg_column_size(input_reference) +
    coalesce(pg_column_size(result_reference), 0) <= 65536
  ),
  constraint automation_error_size check (last_error_summary is null or length(last_error_summary) <= 1000)
);

create table public.automation_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_run_id uuid not null references public.automation_runs(id) on delete cascade,
  attempt_number smallint not null check (attempt_number > 0),
  status text not null check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  error_code text,
  error_summary text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (automation_run_id, attempt_number),
  constraint attempt_error_size check (error_summary is null or length(error_summary) <= 1000)
);

create index external_connections_user_status_idx on public.external_connections (user_id, status);
create index permission_grants_user_active_idx on public.permission_grants (user_id, active, expires_at);
create index evidence_refs_user_discovered_idx on public.evidence_refs (user_id, discovered_at desc);
create index audit_events_user_created_idx on public.audit_events (user_id, created_at desc);
create index audit_events_object_idx on public.audit_events (user_id, object_type, object_id, created_at desc);
create index field_locks_object_idx on public.field_locks (user_id, object_type, object_id) where unlocked_at is null;
create index undo_operations_user_status_idx on public.undo_operations (user_id, status, expires_at);
create index automation_runs_queue_idx on public.automation_runs (status, next_attempt_at, created_at) where status in ('queued', 'failed');
create index automation_runs_user_created_idx on public.automation_runs (user_id, created_at desc);
create index automation_attempts_run_idx on public.automation_attempts (automation_run_id, attempt_number);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.contains_sensitive_key(payload jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  item record;
begin
  if payload is null then
    return false;
  end if;

  if jsonb_typeof(payload) = 'object' then
    for item in
      select object_item.key, object_item.child
      from jsonb_each(payload) as object_item(key, child)
    loop
      if lower(item.key) ~ '(token|password|secret|authorization|otp|verification.?code|email.?body|resume.?content|raw.?content)'
         or private.contains_sensitive_key(item.child) then
        return true;
      end if;
    end loop;
  elsif jsonb_typeof(payload) = 'array' then
    for item in
      select array_item.child
      from jsonb_array_elements(payload) as array_item(child)
    loop
      if private.contains_sensitive_key(item.child) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end;
$$;

create or replace function private.reject_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'audit_events' and (
    private.contains_sensitive_key(new.before_state)
    or private.contains_sensitive_key(new.after_state)
    or private.contains_sensitive_key(new.permission_decision)
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'undo_operations' and private.contains_sensitive_key(new.compensation_payload) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'automation_runs' and (
    private.contains_sensitive_key(new.permission_snapshot)
    or private.contains_sensitive_key(new.input_reference)
    or private.contains_sensitive_key(new.result_reference)
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.evaluate_permission(
  target_user_id uuid,
  target_capability_key text,
  target_operation_id uuid default null
)
returns table (allowed boolean, reason text, grant_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  capability public.capability_definitions%rowtype;
  permission public.permission_grants%rowtype;
  dependency record;
begin
  if auth.uid() is not null and auth.uid() <> target_user_id then
    return query select false, 'not_owner'::text, null::uuid;
    return;
  end if;

  if exists (
    select 1 from public.privacy_locks
    where user_id = target_user_id and is_locked
  ) then
    return query select false, 'privacy_locked'::text, null::uuid;
    return;
  end if;

  select * into capability
  from public.capability_definitions
  where capability_key = target_capability_key;

  if not found then
    return query select false, 'unknown_or_forbidden_capability'::text, null::uuid;
    return;
  end if;

  if capability.requires_ai and not exists (
    select 1 from public.permission_grants
    where user_id = target_user_id
      and capability_key = 'ai.master'
      and active
      and starts_at <= now()
      and mode in ('temporary', 'persistent')
      and (mode <> 'temporary' or expires_at > now())
  ) then
    return query select false, 'ai_master_disabled'::text, null::uuid;
    return;
  end if;

  if capability.connection_provider is not null and not exists (
    select 1 from public.external_connections
    where user_id = target_user_id
      and provider = capability.connection_provider
      and status = 'connected'
  ) then
    return query select false, 'connection_unavailable'::text, null::uuid;
    return;
  end if;

  for dependency in
    select cd.required_capability_key
    from public.capability_dependencies cd
    where cd.capability_key = target_capability_key
  loop
    if not exists (
      select 1 from public.permission_grants pg
      where pg.user_id = target_user_id
        and pg.capability_key = dependency.required_capability_key
        and pg.active
        and pg.starts_at <= now()
        and pg.mode in ('temporary', 'persistent')
        and (pg.mode <> 'temporary' or pg.expires_at > now())
    ) then
      return query select false, ('dependency_denied:' || dependency.required_capability_key)::text, null::uuid;
      return;
    end if;
  end loop;

  select * into permission
  from public.permission_grants
  where user_id = target_user_id and capability_key = target_capability_key;

  if not found or not permission.active or permission.mode = 'off' then
    return query select false, 'grant_inactive'::text, null::uuid;
    return;
  end if;
  if permission.starts_at > now() then
    return query select false, 'grant_not_started'::text, permission.id;
    return;
  end if;
  if permission.mode = 'temporary' and permission.expires_at <= now() then
    return query select false, 'grant_expired'::text, permission.id;
    return;
  end if;
  if permission.mode = 'once' and permission.operation_id is distinct from target_operation_id then
    return query select false, 'operation_mismatch'::text, permission.id;
    return;
  end if;

  return query select true, 'allowed'::text, permission.id;
end;
$$;

create or replace function public.get_my_permission_decision(
  capability_key text,
  operation_id uuid default null
)
returns table (allowed boolean, reason text, grant_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.evaluate_permission(auth.uid(), capability_key, operation_id);
$$;

create or replace function public.reconcile_my_permissions()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  update public.permission_grants
  set active = false, updated_at = now()
  where user_id = auth.uid()
    and active
    and mode in ('once', 'temporary')
    and expires_at is not null
    and expires_at <= now();
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.permission_grant_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  should_cancel boolean;
begin
  should_cancel := not new.active
    or new.mode = 'off'
    or (new.expires_at is not null and new.expires_at <= now());

  if should_cancel then
    update public.automation_runs ar
    set status = case when ar.status = 'queued' then 'cancelled' else 'cancel_requested' end,
        cancel_requested_at = now(),
        finished_at = case when ar.status = 'queued' then now() else ar.finished_at end,
        last_error_code = 'permission_revoked',
        updated_at = now()
    where ar.user_id = new.user_id
      and ar.status in ('queued', 'running')
      and (
        ar.capability_key = new.capability_key
        or (
          new.capability_key = 'ai.master'
          and exists (
            select 1 from public.capability_definitions cd
            where cd.capability_key = ar.capability_key and cd.requires_ai
          )
        )
      );
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    before_state, after_state, permission_decision, outcome
  ) values (
    new.user_id,
    case when auth.uid() is null then 'system' else 'user' end,
    'permission.changed', 'permission_grant', new.id::text,
    case when tg_op = 'UPDATE' then jsonb_build_object('mode', old.mode, 'active', old.active, 'expires_at', old.expires_at) end,
    jsonb_build_object('capability_key', new.capability_key, 'mode', new.mode, 'active', new.active, 'expires_at', new.expires_at),
    jsonb_build_object('source', 'database_trigger'), 'succeeded'
  );

  return new;
end;
$$;

create or replace function private.privacy_lock_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_auth_at timestamptz;
begin
  if tg_op = 'UPDATE' and old.is_locked and not new.is_locked then
    select to_timestamp(max((entry ->> 'timestamp')::double precision))
    into latest_auth_at
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) entry
    where entry ->> 'method' <> 'token_refresh';

    if auth.uid() is not null and (latest_auth_at is null or latest_auth_at <= old.locked_at) then
      raise exception 'fresh_reauthentication_required' using errcode = '42501';
    end if;
    new.unlocked_at := now();
  elsif new.is_locked and (tg_op = 'INSERT' or not old.is_locked) then
    new.locked_at := now();
    new.unlocked_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.privacy_lock_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_locked and (tg_op = 'INSERT' or not old.is_locked) then
    update public.automation_runs
    set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
        cancel_requested_at = now(),
        finished_at = case when status = 'queued' then now() else finished_at end,
        last_error_code = 'privacy_locked',
        updated_at = now()
    where user_id = new.user_id and status in ('queued', 'running');
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    before_state, after_state, permission_decision, outcome
  ) values (
    new.user_id,
    case when auth.uid() is null then 'system' else 'user' end,
    case when new.is_locked then 'privacy_lock.enabled' else 'privacy_lock.disabled' end,
    'privacy_lock', new.user_id::text,
    case when tg_op = 'UPDATE' then jsonb_build_object('is_locked', old.is_locked) end,
    jsonb_build_object('is_locked', new.is_locked, 'reason_code', new.reason_code),
    jsonb_build_object('fresh_reauthentication', not new.is_locked), 'succeeded'
  );

  return new;
end;
$$;

create or replace function private.automation_run_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision record;
begin
  if tg_op = 'INSERT' then
    select * into decision
    from private.evaluate_permission(new.user_id, new.capability_key, new.operation_id);
    if not decision.allowed then
      raise exception 'permission_denied:%', decision.reason using errcode = '42501';
    end if;
    new.permission_grant_id := decision.grant_id;
    new.permission_snapshot := jsonb_build_object(
      'allowed', true,
      'reason', decision.reason,
      'evaluated_at', now()
    );
  elsif old.status is distinct from new.status then
    if not (
      (old.status = 'queued' and new.status in ('running', 'cancelled', 'dead_letter'))
      or (old.status = 'running' and new.status in ('queued', 'cancel_requested', 'succeeded', 'failed', 'dead_letter'))
      or (old.status = 'cancel_requested' and new.status in ('cancelled', 'failed'))
      or (old.status = 'failed' and new.status in ('queued', 'dead_letter'))
    ) then
      raise exception 'invalid_automation_transition:%->%', old.status, new.status using errcode = '23514';
    end if;

    if new.status = 'running' then
      new.started_at := coalesce(new.started_at, now());
      new.attempt_count := old.attempt_count + 1;
    elsif new.status = 'failed' and new.attempt_count >= new.max_attempts then
      new.status := 'dead_letter';
      new.finished_at := now();
    elsif new.status in ('cancelled', 'succeeded', 'dead_letter') then
      new.finished_at := coalesce(new.finished_at, now());
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.consume_once_grant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
     and new.status in ('cancelled', 'succeeded', 'failed', 'dead_letter')
     and new.permission_grant_id is not null then
    update public.permission_grants
    set active = false, updated_at = now()
    where id = new.permission_grant_id and mode = 'once' and active;
  end if;
  return new;
end;
$$;

create trigger capability_definitions_updated_at
before update on public.capability_definitions
for each row execute function private.set_updated_at();
create trigger external_connections_updated_at
before update on public.external_connections
for each row execute function private.set_updated_at();
create trigger permission_grants_updated_at
before update on public.permission_grants
for each row execute function private.set_updated_at();
create trigger undo_operations_updated_at
before update on public.undo_operations
for each row execute function private.set_updated_at();

create trigger audit_events_sensitive_payload
before insert or update on public.audit_events
for each row execute function private.reject_sensitive_payload();
create trigger undo_operations_sensitive_payload
before insert or update on public.undo_operations
for each row execute function private.reject_sensitive_payload();
create trigger automation_runs_sensitive_payload
before insert or update on public.automation_runs
for each row execute function private.reject_sensitive_payload();

create trigger permission_grants_after_change
after insert or update on public.permission_grants
for each row execute function private.permission_grant_changed();
create trigger privacy_locks_before_change
before insert or update on public.privacy_locks
for each row execute function private.privacy_lock_changed();
create trigger privacy_locks_after_change
after insert or update on public.privacy_locks
for each row execute function private.privacy_lock_after_change();
create trigger automation_runs_guard
before insert or update on public.automation_runs
for each row execute function private.automation_run_guard();
create trigger automation_runs_consume_once
after update on public.automation_runs
for each row execute function private.consume_once_grant();

insert into public.capability_definitions (
  capability_key, category, label, description, risk_level,
  requires_ai, supports_once, supports_timed, connection_provider, requires_reverification
) values
  ('ai.master', 'ai', 'AI 与自动化总开关', '控制所有 AI 分析、推荐和自动写入。', 'high', false, false, true, null, false),
  ('ai.analysis', 'ai', 'AI 分析', '允许对必要的最小化内容进行分析。', 'medium', true, true, true, null, false),
  ('ai.recommendation', 'ai', 'AI 推荐', '生成带依据的优先级和行动建议。', 'medium', true, true, true, null, false),
  ('ai.material_draft', 'ai', '材料草稿', '生成可编辑草稿，不提交或发送。', 'high', true, true, true, null, false),
  ('gmail.connection', 'gmail', 'Gmail 连接', '建立或断开 Gmail 只读连接。', 'high', false, true, true, null, true),
  ('gmail.sync', 'gmail', 'Gmail 同步', '增量读取已授权的 Gmail 数据。', 'high', false, true, true, 'gmail', false),
  ('gmail.analysis', 'gmail', '邮件分析', '分析必要邮件摘要与证据。', 'high', true, true, true, 'gmail', false),
  ('gmail.personal_action_extract', 'gmail', '个人事项提取', '只提取个人邮件中的行动和日期。', 'high', true, true, true, 'gmail', false),
  ('gmail.attachment_import', 'gmail', '附件导入', '导入明确相关附件并通知。', 'high', false, true, true, 'gmail', false),
  ('calendar.connection', 'calendar', 'Calendar 连接', '建立或断开 Google Calendar 连接。', 'high', false, true, true, null, true),
  ('calendar.read', 'calendar', '读取日历', '读取事件用于冲突判断。', 'medium', false, true, true, 'calendar', false),
  ('calendar.write_fact', 'calendar', '写入明确事实', '写入高置信度且可追溯的事实事件。', 'high', false, true, true, 'calendar', true),
  ('calendar.write_confirmed_plan', 'calendar', '写入已确认计划', '只写入用户确认后的计划。', 'high', false, true, true, 'calendar', true),
  ('calendar.update_product_event', 'calendar', '更新产品事件', '更新由本产品创建的日历事件。', 'high', false, true, true, 'calendar', false),
  ('job_radar.discovery', 'job_radar', '岗位发现', '从已批准来源发现候选岗位。', 'medium', false, true, true, null, false),
  ('job_radar.scoring', 'job_radar', '岗位评分', '生成资格、匹配、意愿和紧迫解释。', 'medium', true, true, true, null, false),
  ('job_status.auto_update', 'job_radar', '岗位状态自动更新', '基于证据提出或执行允许的状态更新。', 'high', true, true, true, null, false),
  ('wechat.local_sanitize', 'wechat', '微信本地净化', '上传前在本地去除无关内容。', 'medium', false, true, true, null, false),
  ('wechat.import', 'wechat', '微信一键导入', '导入用户主动分享的文字、截图、文件或链接。', 'high', false, true, true, null, false),
  ('academic.extract', 'academic', '学业事项提取', '从已导入材料提取课程事项。', 'medium', true, true, true, null, false),
  ('files.upload', 'files', '文件上传', '上传用户明确选择的文件。', 'high', false, true, true, null, false),
  ('reports.generate', 'reports', '报告生成', '生成晨报、晚间收尾和周报。', 'medium', true, true, true, null, false),
  ('notifications.smart_push', 'notifications', '智能通知', '发送产品内允许的高价值提醒。', 'medium', false, true, true, null, false);

insert into public.capability_dependencies (capability_key, required_capability_key) values
  ('gmail.sync', 'gmail.connection'),
  ('gmail.analysis', 'gmail.sync'),
  ('gmail.analysis', 'ai.analysis'),
  ('gmail.personal_action_extract', 'gmail.sync'),
  ('gmail.personal_action_extract', 'ai.analysis'),
  ('gmail.attachment_import', 'gmail.sync'),
  ('calendar.read', 'calendar.connection'),
  ('calendar.write_fact', 'calendar.connection'),
  ('calendar.write_confirmed_plan', 'calendar.connection'),
  ('calendar.update_product_event', 'calendar.connection'),
  ('job_radar.scoring', 'job_radar.discovery'),
  ('job_radar.scoring', 'ai.analysis'),
  ('job_status.auto_update', 'ai.analysis'),
  ('wechat.import', 'wechat.local_sanitize'),
  ('academic.extract', 'ai.analysis'),
  ('reports.generate', 'ai.analysis'),
  ('notifications.smart_push', 'reports.generate');

alter table public.capability_definitions enable row level security;
alter table public.capability_dependencies enable row level security;
alter table public.external_connections enable row level security;
alter table public.permission_grants enable row level security;
alter table public.privacy_locks enable row level security;
alter table public.evidence_refs enable row level security;
alter table public.audit_events enable row level security;
alter table public.audit_event_evidence enable row level security;
alter table public.field_locks enable row level security;
alter table public.undo_operations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.automation_attempts enable row level security;

create policy capability_definitions_read on public.capability_definitions
for select to authenticated using (true);
create policy capability_dependencies_read on public.capability_dependencies
for select to authenticated using (true);

create policy external_connections_read_own on public.external_connections
for select to authenticated using ((select auth.uid()) = user_id);

create policy permission_grants_read_own on public.permission_grants
for select to authenticated using ((select auth.uid()) = user_id);
create policy permission_grants_insert_own on public.permission_grants
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);
create policy permission_grants_update_own on public.permission_grants
for update to authenticated
using (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
)
with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);
create policy permission_grants_delete_own on public.permission_grants
for delete to authenticated using (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy privacy_locks_read_own on public.privacy_locks
for select to authenticated using ((select auth.uid()) = user_id);
create policy privacy_locks_insert_own on public.privacy_locks
for insert to authenticated with check ((select auth.uid()) = user_id);
create policy privacy_locks_update_own on public.privacy_locks
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy evidence_refs_own on public.evidence_refs
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy audit_events_read_own on public.audit_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy audit_events_insert_user on public.audit_events
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and actor_type = 'user'
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy audit_event_evidence_own on public.audit_event_evidence
for all to authenticated
using (
  exists (select 1 from public.audit_events ae where ae.id = audit_event_id and ae.user_id = (select auth.uid()))
)
with check (
  exists (select 1 from public.audit_events ae where ae.id = audit_event_id and ae.user_id = (select auth.uid()))
  and exists (select 1 from public.evidence_refs er where er.id = evidence_id and er.user_id = (select auth.uid()))
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy field_locks_own on public.field_locks
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy undo_operations_read_own on public.undo_operations
for select to authenticated using ((select auth.uid()) = user_id);
create policy undo_operations_write_own on public.undo_operations
for all to authenticated
using (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
)
with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy automation_runs_read_own on public.automation_runs
for select to authenticated using ((select auth.uid()) = user_id);
create policy automation_runs_insert_own on public.automation_runs
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);
create policy automation_runs_update_own on public.automation_runs
for update to authenticated
using (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
)
with check (
  (select auth.uid()) = user_id
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

create policy automation_attempts_own on public.automation_attempts
for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.automation_runs ar
    where ar.id = automation_run_id and ar.user_id = (select auth.uid())
  )
  and not exists (select 1 from public.privacy_locks where user_id = (select auth.uid()) and is_locked)
);

revoke all on all tables in schema public from anon, authenticated;
grant select on public.capability_definitions, public.capability_dependencies to authenticated;
grant select on public.external_connections to authenticated;
grant select, insert, update, delete on public.permission_grants to authenticated;
grant select, insert, update on public.privacy_locks to authenticated;
grant select, insert, update, delete on public.evidence_refs to authenticated;
grant select, insert on public.audit_events to authenticated;
grant select, insert, update, delete on public.audit_event_evidence to authenticated;
grant select, insert, update, delete on public.field_locks to authenticated;
grant select, insert, update, delete on public.undo_operations to authenticated;
grant select, insert, update on public.automation_runs to authenticated;
grant select, insert, update, delete on public.automation_attempts to authenticated;
grant all on all tables in schema public to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.get_my_permission_decision(text, uuid) from public, anon;
revoke execute on function public.reconcile_my_permissions() from public, anon;
grant execute on function public.get_my_permission_decision(text, uuid) to authenticated, service_role;
grant execute on function public.reconcile_my_permissions() to authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
