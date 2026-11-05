-- Job discovery V0: user-approved public sources, per-source cadence, and
-- honest health/run coverage. This slice does not fetch any real source and
-- does not create opportunity candidates.

create table public.job_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_key text not null check (source_key ~ '^[a-z0-9][a-z0-9._-]{1,119}$'),
  display_name text not null check (length(display_name) between 1 and 160),
  source_kind text not null check (source_kind in ('company_careers', 'university_public', 'public_board', 'synthetic')),
  base_url text not null check (base_url ~ '^https://[^/@]+(?:/|$)'),
  source_domain text not null check (source_domain ~ '^[a-z0-9.-]+$'),
  access_mode text not null default 'public_web' check (access_mode = 'public_web'),
  coverage_scope text not null check (length(coverage_scope) between 1 and 500),
  usage_note text check (usage_note is null or length(usage_note) <= 1000),
  polling_interval_minutes integer not null default 360 check (polling_interval_minutes between 60 and 10080),
  adapter_version text not null check (length(adapter_version) between 1 and 80),
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  enabled boolean not null default false,
  health_status text not null default 'disabled' check (health_status in ('disabled', 'pending', 'healthy', 'degraded', 'failed')),
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_verified_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 120),
  coverage_gap text check (coverage_gap is null or length(coverage_gap) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_key),
  constraint job_sources_domain_matches_url check (
    position('@' in split_part(substr(base_url, 9), '/', 1)) = 0
    and lower(split_part(split_part(substr(base_url, 9), '/', 1), ':', 1)) = source_domain
  ),
  constraint job_sources_enabled_requires_approval check (not enabled or approval_status = 'approved'),
  constraint job_sources_disabled_health check (enabled or health_status = 'disabled')
);

create table public.job_source_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.job_sources(id) on delete cascade,
  automation_run_id uuid not null references public.automation_runs(id) on delete restrict,
  run_key text not null check (length(run_key) between 1 and 160),
  status text not null default 'running' check (status in ('running', 'succeeded', 'partial', 'failed', 'cancelled')),
  observed_count integer not null default 0 check (observed_count between 0 and 10000),
  new_count integer not null default 0 check (new_count between 0 and observed_count),
  updated_count integer not null default 0 check (updated_count between 0 and observed_count),
  error_code text check (error_code is null or length(error_code) <= 120),
  coverage_gap text check (coverage_gap is null or length(coverage_gap) <= 500),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source_id, run_key),
  constraint job_source_runs_terminal_shape check (
    (status = 'running' and finished_at is null)
    or (status <> 'running' and finished_at is not null)
  ),
  constraint job_source_runs_failure_shape check (
    (status = 'failed' and error_code is not null and coverage_gap is not null)
    or status <> 'failed'
  ),
  constraint job_source_runs_partial_shape check (
    (status = 'partial' and coverage_gap is not null)
    or status <> 'partial'
  )
);

create table private.job_source_cursors (
  source_id uuid primary key references public.job_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cursor_value text check (cursor_value is null or length(cursor_value) <= 4096),
  query_fingerprint text not null check (query_fingerprint ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now()
);

create index job_sources_health_idx
  on public.job_sources (user_id, enabled, health_status, last_success_at desc);
create index job_source_runs_source_started_idx
  on public.job_source_runs (source_id, started_at desc);
create index job_source_runs_user_started_idx
  on public.job_source_runs (user_id, started_at desc);
create index job_source_runs_automation_run_idx
  on public.job_source_runs (automation_run_id);
create index job_source_cursors_user_idx
  on private.job_source_cursors (user_id);

create trigger job_sources_set_updated_at before update on public.job_sources
for each row execute function private.set_updated_at();

create or replace function private.propose_job_source(
  target_user_id uuid,
  target_source_key text,
  target_display_name text,
  target_source_kind text,
  target_base_url text,
  target_source_domain text,
  target_coverage_scope text,
  target_usage_note text,
  target_polling_interval_minutes integer,
  target_adapter_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_id uuid;
begin
  if target_user_id is null then
    raise exception 'user_required' using errcode = '22023';
  end if;

  insert into public.job_sources (
    user_id, source_key, display_name, source_kind, base_url, source_domain,
    coverage_scope, usage_note, polling_interval_minutes, adapter_version
  ) values (
    target_user_id, lower(trim(target_source_key)), trim(target_display_name), target_source_kind,
    trim(target_base_url), lower(trim(target_source_domain)), trim(target_coverage_scope),
    nullif(trim(target_usage_note), ''), target_polling_interval_minutes, trim(target_adapter_version)
  )
  on conflict (user_id, source_key) do update set
    display_name = excluded.display_name,
    source_kind = excluded.source_kind,
    base_url = excluded.base_url,
    source_domain = excluded.source_domain,
    coverage_scope = excluded.coverage_scope,
    usage_note = excluded.usage_note,
    polling_interval_minutes = excluded.polling_interval_minutes,
    adapter_version = excluded.adapter_version,
    enabled = false,
    health_status = 'disabled',
    coverage_gap = 'source_changed_requires_review'
  where public.job_sources.approval_status <> 'approved'
  returning id into source_id;

  if source_id is null then
    select id into source_id
    from public.job_sources
    where user_id = target_user_id and source_key = lower(trim(target_source_key));
  end if;

  return source_id;
end;
$$;

create or replace function private.review_job_source(
  actor_user_id uuid,
  target_source_id uuid,
  target_action text,
  target_polling_interval_minutes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.job_sources%rowtype;
  permission record;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into source_record
  from public.job_sources
  where id = target_source_id and user_id = actor_user_id
  for update;

  if not found then
    raise exception 'job_source_not_found' using errcode = 'P0002';
  end if;

  if target_action in ('approve', 'enable') and not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  if target_polling_interval_minutes is not null
     and target_polling_interval_minutes not between 60 and 10080 then
    raise exception 'invalid_polling_interval' using errcode = '22023';
  end if;

  case target_action
    when 'approve' then
      update public.job_sources set
        approval_status = 'approved',
        enabled = false,
        health_status = 'disabled',
        polling_interval_minutes = coalesce(target_polling_interval_minutes, polling_interval_minutes),
        coverage_gap = 'approved_but_disabled',
        last_error_code = null
      where id = target_source_id;
    when 'reject' then
      update public.job_sources set
        approval_status = 'rejected', enabled = false, health_status = 'disabled',
        coverage_gap = 'rejected_by_user', last_error_code = null
      where id = target_source_id;
    when 'enable' then
      if source_record.approval_status <> 'approved' then
        raise exception 'job_source_not_approved' using errcode = '42501';
      end if;
      select * into permission
      from private.evaluate_permission(actor_user_id, 'job_radar.discovery', null);
      if not coalesce(permission.allowed, false) then
        raise exception 'job_discovery_permission_denied:%', coalesce(permission.reason, 'unknown') using errcode = '42501';
      end if;
      update public.job_sources set
        enabled = true,
        health_status = 'pending',
        polling_interval_minutes = coalesce(target_polling_interval_minutes, polling_interval_minutes),
        coverage_gap = 'awaiting_first_verified_run',
        last_error_code = null
      where id = target_source_id;
    when 'disable' then
      update public.job_sources set
        enabled = false, health_status = 'disabled', coverage_gap = 'disabled_by_user'
      where id = target_source_id;
    else
      raise exception 'invalid_job_source_action' using errcode = '22023';
  end case;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state,
    permission_decision, rule_version, outcome
  ) values (
    actor_user_id, 'user', 'job_source.' || target_action, 'job_source', target_source_id::text,
    jsonb_build_object(
      'approvalStatus', (select approval_status from public.job_sources where id = target_source_id),
      'enabled', (select enabled from public.job_sources where id = target_source_id),
      'pollingIntervalMinutes', (select polling_interval_minutes from public.job_sources where id = target_source_id)
    ),
    jsonb_build_object('capability', 'job_radar.discovery', 'action', target_action),
    'job-discovery-v0', 'succeeded'
  );

  return target_source_id;
end;
$$;

create or replace function private.start_job_source_run(
  target_user_id uuid,
  target_source_id uuid,
  target_run_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.job_sources%rowtype;
  permission record;
  automation_id uuid;
  source_run_id uuid;
begin
  select id into source_run_id
  from public.job_source_runs
  where source_id = target_source_id and run_key = target_run_key;
  if source_run_id is not null then return source_run_id; end if;

  select * into source_record
  from public.job_sources
  where id = target_source_id and user_id = target_user_id
  for update;
  if not found then raise exception 'job_source_not_found' using errcode = 'P0002'; end if;
  if source_record.approval_status <> 'approved' or not source_record.enabled then
    raise exception 'job_source_not_enabled' using errcode = '42501';
  end if;
  if source_record.access_mode <> 'public_web' then
    raise exception 'job_source_not_public' using errcode = '42501';
  end if;
  if source_record.last_attempt_at is not null
     and source_record.last_attempt_at + make_interval(mins => source_record.polling_interval_minutes) > now() then
    raise exception 'job_source_not_due' using errcode = '55000';
  end if;

  select * into permission
  from private.evaluate_permission(target_user_id, 'job_radar.discovery', null);
  if not coalesce(permission.allowed, false) then
    raise exception 'job_discovery_permission_denied:%', coalesce(permission.reason, 'unknown') using errcode = '42501';
  end if;

  insert into public.automation_runs (
    user_id, capability_key, permission_grant_id, idempotency_key, status,
    progress, safe_checkpoint, permission_snapshot, input_reference, started_at
  ) values (
    target_user_id, 'job_radar.discovery', permission.grant_id,
    'job-source:' || target_source_id::text || ':' || target_run_key,
    'running', 10, 'source_approved',
    jsonb_build_object('allowed', true, 'reason', permission.reason),
    jsonb_build_object('sourceId', target_source_id, 'sourceKey', source_record.source_key), now()
  ) returning id into automation_id;

  insert into public.job_source_runs (
    user_id, source_id, automation_run_id, run_key
  ) values (
    target_user_id, target_source_id, automation_id, target_run_key
  ) returning id into source_run_id;

  update public.job_sources set
    health_status = 'pending', last_attempt_at = now(), last_error_code = null,
    coverage_gap = 'run_in_progress'
  where id = target_source_id;

  return source_run_id;
end;
$$;

create or replace function private.finish_job_source_run(
  target_run_id uuid,
  target_status text,
  target_observed_count integer,
  target_new_count integer,
  target_updated_count integer,
  target_error_code text default null,
  target_coverage_gap text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.job_source_runs%rowtype;
  permission record;
  effective_status text := target_status;
  effective_error text := nullif(trim(target_error_code), '');
  effective_gap text := nullif(trim(target_coverage_gap), '');
begin
  select * into run_record
  from public.job_source_runs
  where id = target_run_id
  for update;
  if not found then raise exception 'job_source_run_not_found' using errcode = 'P0002'; end if;
  if run_record.status <> 'running' then return run_record.source_id; end if;
  if target_status not in ('succeeded', 'partial', 'failed', 'cancelled') then
    raise exception 'invalid_job_source_run_status' using errcode = '22023';
  end if;
  if target_observed_count not between 0 and 10000
     or target_new_count not between 0 and target_observed_count
     or target_updated_count not between 0 and target_observed_count then
    raise exception 'invalid_job_source_run_counts' using errcode = '22023';
  end if;

  select * into permission
  from private.evaluate_permission(run_record.user_id, 'job_radar.discovery', null);
  if effective_status in ('succeeded', 'partial') and not coalesce(permission.allowed, false) then
    effective_status := 'cancelled';
    effective_error := coalesce(permission.reason, 'permission_denied');
    effective_gap := 'permission_stopped_before_commit';
  end if;
  if effective_status = 'failed' and (effective_error is null or effective_gap is null) then
    raise exception 'failed_run_requires_error_and_gap' using errcode = '22023';
  end if;
  if effective_status = 'partial' and effective_gap is null then
    raise exception 'partial_run_requires_gap' using errcode = '22023';
  end if;

  update public.job_source_runs set
    status = effective_status,
    observed_count = target_observed_count,
    new_count = target_new_count,
    updated_count = target_updated_count,
    error_code = effective_error,
    coverage_gap = effective_gap,
    finished_at = now()
  where id = target_run_id;

  update public.automation_runs set
    status = case effective_status when 'partial' then 'succeeded' else effective_status end,
    progress = case when effective_status in ('succeeded', 'partial') then 100 else progress end,
    safe_checkpoint = case effective_status
      when 'succeeded' then 'source_verified'
      when 'partial' then 'source_partial'
      when 'failed' then 'source_failed'
      else 'permission_stopped'
    end,
    last_error_code = effective_error,
    last_error_summary = effective_gap,
    finished_at = now()
  where id = run_record.automation_run_id;

  update public.job_sources set
    health_status = case effective_status
      when 'succeeded' then 'healthy'
      when 'partial' then 'degraded'
      when 'failed' then 'failed'
      else case when enabled then 'degraded' else 'disabled' end
    end,
    last_success_at = case when effective_status in ('succeeded', 'partial') then now() else last_success_at end,
    last_verified_at = case when effective_status in ('succeeded', 'partial') then now() else last_verified_at end,
    last_error_code = effective_error,
    coverage_gap = case when effective_status = 'succeeded' then null else coalesce(effective_gap, effective_error, 'run_cancelled') end
  where id = run_record.source_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state,
    permission_decision, rule_version, outcome
  ) values (
    run_record.user_id, 'scheduler', 'job_source.run_finished', 'job_source_run', target_run_id::text,
    jsonb_build_object(
      'status', effective_status, 'observedCount', target_observed_count,
      'newCount', target_new_count, 'updatedCount', target_updated_count,
      'errorCode', effective_error, 'coverageGap', effective_gap
    ),
    jsonb_build_object('capability', 'job_radar.discovery', 'allowed', coalesce(permission.allowed, false), 'reason', permission.reason),
    'job-discovery-v0', case when effective_status = 'failed' then 'failed' else 'succeeded' end
  );

  return run_record.source_id;
end;
$$;

create or replace function public.propose_job_source(
  target_user_id uuid,
  target_source_key text,
  target_display_name text,
  target_source_kind text,
  target_base_url text,
  target_source_domain text,
  target_coverage_scope text,
  target_usage_note text,
  target_polling_interval_minutes integer,
  target_adapter_version text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.propose_job_source(
    target_user_id, target_source_key, target_display_name, target_source_kind,
    target_base_url, target_source_domain, target_coverage_scope, target_usage_note,
    target_polling_interval_minutes, target_adapter_version
  );
$$;

create or replace function public.review_my_job_source(
  target_source_id uuid,
  target_action text,
  target_polling_interval_minutes integer default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.review_job_source(auth.uid(), target_source_id, target_action, target_polling_interval_minutes);
$$;

create or replace function public.start_job_source_run(
  target_user_id uuid,
  target_source_id uuid,
  target_run_key text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.start_job_source_run(target_user_id, target_source_id, target_run_key);
$$;

create or replace function public.finish_job_source_run(
  target_run_id uuid,
  target_status text,
  target_observed_count integer,
  target_new_count integer,
  target_updated_count integer,
  target_error_code text default null,
  target_coverage_gap text default null
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.finish_job_source_run(
    target_run_id, target_status, target_observed_count, target_new_count,
    target_updated_count, target_error_code, target_coverage_gap
  );
$$;

alter table public.job_sources enable row level security;
alter table public.job_source_runs enable row level security;
alter table private.job_source_cursors enable row level security;

create policy job_sources_read_own on public.job_sources for select to authenticated
using ((select auth.uid()) = user_id);
create policy job_sources_service on public.job_sources for all to service_role
using (true) with check (true);
create policy job_source_runs_read_own on public.job_source_runs for select to authenticated
using ((select auth.uid()) = user_id);
create policy job_source_runs_service on public.job_source_runs for all to service_role
using (true) with check (true);

revoke all on public.job_sources, public.job_source_runs from public, anon, authenticated;
grant select on public.job_sources, public.job_source_runs to authenticated;
grant select, insert, update, delete on public.job_sources, public.job_source_runs to service_role;

revoke all on private.job_source_cursors from public, anon, authenticated;
grant select, insert, update, delete on private.job_source_cursors to service_role;

revoke execute on function private.propose_job_source(uuid, text, text, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke execute on function private.review_job_source(uuid, uuid, text, integer) from public, anon, authenticated;
revoke execute on function private.start_job_source_run(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.finish_job_source_run(uuid, text, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function private.propose_job_source(uuid, text, text, text, text, text, text, text, integer, text) to service_role;
grant execute on function private.review_job_source(uuid, uuid, text, integer) to service_role;
grant execute on function private.start_job_source_run(uuid, uuid, text) to service_role;
grant execute on function private.finish_job_source_run(uuid, text, integer, integer, integer, text, text) to service_role;

revoke execute on function public.propose_job_source(uuid, text, text, text, text, text, text, text, integer, text) from public, anon, authenticated;
revoke execute on function public.review_my_job_source(uuid, text, integer) from public, anon;
revoke execute on function public.start_job_source_run(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.finish_job_source_run(uuid, text, integer, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.propose_job_source(uuid, text, text, text, text, text, text, text, integer, text) to service_role;
grant execute on function public.review_my_job_source(uuid, text, integer) to authenticated, service_role;
grant execute on function public.start_job_source_run(uuid, uuid, text) to service_role;
grant execute on function public.finish_job_source_run(uuid, text, integer, integer, integer, text, text) to service_role;
