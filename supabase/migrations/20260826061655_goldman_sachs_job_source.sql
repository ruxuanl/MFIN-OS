-- First approved Job Discovery source: Goldman Sachs APAC early-career
-- program pages. The application portal is intentionally excluded because
-- its robots policy disallows crawling outside /roles/.

create table private.job_source_items (
  source_id uuid not null references public.job_sources(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z0-9][a-z0-9._:-]{1,159}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid references public.opportunity_candidates(id) on delete set null,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (source_id, item_key)
);

create index job_source_items_user_seen_idx
  on private.job_source_items (user_id, last_seen_at desc);
create index job_source_items_candidate_idx
  on private.job_source_items (candidate_id)
  where candidate_id is not null;

revoke all on private.job_source_items from public, anon, authenticated;
grant select, insert, update, delete on private.job_source_items to service_role;

-- Service-originated candidates must not be described as user-created in the
-- append-only timeline. Interactive browser writes keep the original actor.
create or replace function private.append_workspace_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text;
  target_summary text;
  target_actor text := case
    when tg_table_name = 'opportunity_candidates' and coalesce(auth.role(), '') = 'service_role' then 'sync'
    else 'user'
  end;
begin
  target_type := case tg_table_name
    when 'opportunity_candidates' then 'candidate'
    when 'opportunities' then 'opportunity'
    when 'courses' then 'course'
    when 'actions' then 'action'
  end;
  target_summary := case
    when tg_table_name = 'opportunity_candidates' and target_actor = 'sync'
      then '公开来源岗位已加入候选池'
    when tg_table_name = 'opportunity_candidates' then '候选岗位已加入候选池'
    when tg_table_name = 'opportunities' then '正式追踪记录已创建'
    when tg_table_name = 'courses' then '课程已加入学业表'
    when tg_table_name = 'actions' then '行动已创建'
  end;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    new.user_id, target_type, new.id, 'created', target_actor, target_summary,
    jsonb_build_object('version', new.version)
  );
  return new;
end;
$$;

create function private.complete_goldman_sachs_job_source_run(
  target_run_id uuid,
  target_items jsonb,
  target_status text,
  target_coverage_gap text,
  target_cursor_value text,
  target_query_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.job_source_runs%rowtype;
  source_record public.job_sources%rowtype;
  permission record;
  item jsonb;
  item_record private.job_source_items%rowtype;
  target_item_key text;
  item_track text;
  item_company text;
  item_department text;
  item_role_title text;
  item_location text;
  item_deadline date;
  item_summary text;
  item_url text;
  item_hash text;
  item_domain text;
  new_candidate_id uuid;
  observed_count integer;
  new_count integer := 0;
  updated_count integer := 0;
begin
  select * into run_record
  from public.job_source_runs
  where id = target_run_id
  for update;
  if not found then raise exception 'job_source_run_not_found' using errcode = 'P0002'; end if;
  if run_record.status <> 'running' then
    return jsonb_build_object('status', run_record.status, 'observed', run_record.observed_count,
      'new', run_record.new_count, 'updated', run_record.updated_count, 'replayed', true);
  end if;

  select * into source_record
  from public.job_sources
  where id = run_record.source_id and user_id = run_record.user_id
  for update;
  if not found then raise exception 'job_source_not_found' using errcode = 'P0002'; end if;
  if source_record.source_key <> 'goldman-sachs.apac-early-careers'
     or source_record.source_domain <> 'www.goldmansachs.com'
     or source_record.adapter_version <> 'goldman_sachs_public_programs_v1' then
    raise exception 'goldman_sachs_source_contract_mismatch' using errcode = '42501';
  end if;
  if source_record.approval_status <> 'approved' or not source_record.enabled then
    raise exception 'job_source_not_enabled' using errcode = '42501';
  end if;

  select * into permission
  from private.evaluate_permission(run_record.user_id, 'job_radar.discovery', null);
  if not coalesce(permission.allowed, false) then
    raise exception 'job_discovery_permission_denied:%', coalesce(permission.reason, 'unknown') using errcode = '42501';
  end if;

  if target_status not in ('succeeded', 'partial') then
    raise exception 'invalid_goldman_sachs_completion_status' using errcode = '22023';
  end if;
  if target_status = 'partial' and nullif(trim(target_coverage_gap), '') is null then
    raise exception 'partial_run_requires_gap' using errcode = '22023';
  end if;
  if jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 50 then
    raise exception 'invalid_job_source_items' using errcode = '22023';
  end if;
  if target_cursor_value !~ '^[0-9a-f]{64}$'
     or target_query_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_job_source_cursor' using errcode = '22023';
  end if;

  observed_count := jsonb_array_length(target_items);
  if exists (
    select 1 from jsonb_array_elements(target_items) entry
    group by entry ->> 'itemKey' having count(*) > 1
  ) then
    raise exception 'duplicate_job_source_item_key' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(target_items)
  loop
    target_item_key := trim(item ->> 'itemKey');
    item_track := trim(item ->> 'track');
    item_company := trim(item ->> 'company');
    item_department := nullif(trim(item ->> 'department'), '');
    item_role_title := trim(item ->> 'roleTitle');
    item_location := nullif(trim(item ->> 'location'), '');
    item_summary := trim(item ->> 'sourceSummary');
    item_url := trim(item ->> 'sourceUrl');
    item_hash := lower(trim(item ->> 'contentHash'));
    item_deadline := case when nullif(trim(item ->> 'deadline'), '') is null
      then null else (item ->> 'deadline')::date end;
    item_domain := lower(split_part(split_part(substr(item_url, 9), '/', 1), ':', 1));

    if target_item_key !~ '^[a-z0-9][a-z0-9._:-]{1,159}$'
       or item_track not in ('internship', 'graduate')
       or item_company <> 'Goldman Sachs'
       or length(item_role_title) not between 1 and 240
       or (item_department is not null and length(item_department) > 240)
       or (item_location is not null and length(item_location) > 240)
       or length(item_summary) not between 1 and 1000
       or length(item_url) > 2048
       or item_url !~ '^https://[^/@]+(?:/|$)'
       or item_domain <> source_record.source_domain
       or item_hash !~ '^[0-9a-f]{64}$' then
      raise exception 'invalid_goldman_sachs_item' using errcode = '22023';
    end if;

    select * into item_record
    from private.job_source_items
    where source_id = source_record.id and item_key = target_item_key
    for update;

    if not found or item_record.candidate_id is null then
      insert into public.opportunity_candidates (
        user_id, track, company, department, role_title, location, work_mode,
        deadline, source_summary, source_url, discovered_at, last_verified_at
      ) values (
        run_record.user_id, item_track, item_company, item_department, item_role_title,
        item_location, 'unspecified', item_deadline, item_summary, item_url, now(), now()
      ) returning id into new_candidate_id;

      insert into private.job_source_items (
        source_id, item_key, user_id, candidate_id, content_hash
      ) values (
        source_record.id, target_item_key, run_record.user_id, new_candidate_id, item_hash
      ) on conflict (source_id, item_key) do update set
        candidate_id = excluded.candidate_id,
        content_hash = excluded.content_hash,
        last_seen_at = now(),
        updated_at = now();
      new_count := new_count + 1;
    else
      update private.job_source_items set
        content_hash = item_hash,
        last_seen_at = now(),
        updated_at = case when content_hash <> item_hash then now() else updated_at end
      where source_id = source_record.id and item_key = target_item_key;

      if item_record.content_hash <> item_hash then
        updated_count := updated_count + 1;
        update public.opportunity_candidates set
          track = item_track,
          company = item_company,
          department = item_department,
          role_title = item_role_title,
          location = item_location,
          work_mode = 'unspecified',
          deadline = item_deadline,
          source_summary = item_summary,
          source_url = item_url,
          last_verified_at = now(),
          version = version + 1
        where id = item_record.candidate_id and user_id = run_record.user_id
          and decision_status in ('candidate', 'later');

        insert into public.timeline_entries (
          user_id, entity_type, entity_id, event_type, actor_type, summary, changes
        ) values (
          run_record.user_id, 'candidate', item_record.candidate_id,
          'job_source.reverified', 'sync', '公开来源岗位信息已重新核验',
          jsonb_build_object('sourceId', source_record.id, 'sourceKey', source_record.source_key)
        );
      else
        update public.opportunity_candidates set last_verified_at = now()
        where id = item_record.candidate_id and user_id = run_record.user_id
          and decision_status in ('candidate', 'later');
      end if;
    end if;
  end loop;

  insert into private.job_source_cursors (
    source_id, user_id, cursor_value, query_fingerprint
  ) values (
    source_record.id, run_record.user_id, target_cursor_value, target_query_fingerprint
  ) on conflict (source_id) do update set
    cursor_value = excluded.cursor_value,
    query_fingerprint = excluded.query_fingerprint,
    updated_at = now();

  perform private.finish_job_source_run(
    target_run_id, target_status, observed_count, new_count, updated_count,
    null, nullif(trim(target_coverage_gap), '')
  );

  return jsonb_build_object(
    'status', target_status, 'observed', observed_count,
    'new', new_count, 'updated', updated_count, 'replayed', false
  );
end;
$$;

create function public.complete_goldman_sachs_job_source_run(
  target_run_id uuid,
  target_items jsonb,
  target_status text,
  target_coverage_gap text,
  target_cursor_value text,
  target_query_fingerprint text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.complete_goldman_sachs_job_source_run(
    target_run_id, target_items, target_status, target_coverage_gap,
    target_cursor_value, target_query_fingerprint
  );
$$;

revoke execute on function private.complete_goldman_sachs_job_source_run(uuid, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function private.complete_goldman_sachs_job_source_run(uuid, jsonb, text, text, text, text)
  to service_role;
revoke execute on function public.complete_goldman_sachs_job_source_run(uuid, jsonb, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_goldman_sachs_job_source_run(uuid, jsonb, text, text, text, text)
  to service_role;

create function private.invoke_goldman_sachs_job_source_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_origin text;
  source_record public.job_sources%rowtype;
  permission record;
  source_run_id uuid;
  run_key text;
  request_id bigint;
begin
  select decrypted_secret into app_origin
  from vault.decrypted_secrets
  where name = 'job_discovery_app_origin'
  order by created_at desc
  limit 1;

  -- Unconfigured environments remain an explicit no-op.
  if app_origin is null or app_origin !~ '^https://[A-Za-z0-9.-]+$' then
    return null;
  end if;

  select * into source_record
  from public.job_sources
  where source_key = 'goldman-sachs.apac-early-careers'
    and approval_status = 'approved' and enabled
  order by created_at
  limit 1
  for update skip locked;
  if not found then return null; end if;

  select * into permission
  from private.evaluate_permission(source_record.user_id, 'job_radar.discovery', null);
  if not coalesce(permission.allowed, false) then return null; end if;

  if source_record.last_attempt_at is not null
     and source_record.last_attempt_at + make_interval(mins => source_record.polling_interval_minutes) > now() then
    return null;
  end if;

  run_key := 'goldman-sachs:' || to_char(
    date_bin(interval '6 hours', now(), timestamptz '2000-01-01 00:00:00+00'),
    'YYYYMMDD"T"HH24MI"Z"'
  );
  source_run_id := private.start_job_source_run(source_record.user_id, source_record.id, run_key);

  select net.http_post(
    url := rtrim(app_origin, '/') || '/api/internal/job-discovery/goldman-sachs',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('runId', source_run_id),
    timeout_milliseconds := 10000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function private.invoke_goldman_sachs_job_source_cron() from public, anon, authenticated;
grant execute on function private.invoke_goldman_sachs_job_source_cron() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'job-discovery-goldman-sachs-6h';
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;

  perform cron.schedule(
    'job-discovery-goldman-sachs-6h',
    '23 */6 * * *',
    $cron$select private.invoke_goldman_sachs_job_source_cron();$cron$
  );
end;
$$;
