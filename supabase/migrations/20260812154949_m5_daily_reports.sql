-- M5: deterministic daily brief, report schedules, immutable report versions,
-- and notification allow-list/deduplication. AI providers remain out of scope;
-- generated reports identify the rule strategy explicitly.

create extension if not exists pg_cron with schema pg_catalog;

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('morning', 'evening', 'weekly')),
  enabled boolean not null default true,
  local_time time not null,
  weekday smallint,
  time_zone text not null default 'Asia/Hong_Kong' check (length(time_zone) between 1 and 120),
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status text not null default 'never' check (last_status in ('never', 'ready', 'empty', 'permission_blocked', 'failed')),
  last_error_code text check (last_error_code is null or length(last_error_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, report_type),
  constraint report_schedule_weekday_shape check (
    (report_type = 'weekly' and weekday between 1 and 7)
    or (report_type <> 'weekly' and weekday is null)
  )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null check (report_type in ('morning', 'evening', 'weekly')),
  report_date date not null,
  version integer not null check (version > 0),
  status text not null check (status in ('ready', 'empty', 'failed', 'superseded')),
  title text not null check (length(title) between 1 and 300),
  summary text not null check (length(summary) between 1 and 2000),
  generation_strategy text not null default 'rules_v1' check (generation_strategy in ('rules_v1', 'ai')),
  data_cutoff_at timestamptz not null,
  source_health jsonb not null default '{}'::jsonb,
  automation_run_id uuid references public.automation_runs(id) on delete set null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, report_type, report_date, version),
  constraint report_source_health_object check (jsonb_typeof(source_health) = 'object'),
  constraint report_source_health_size check (pg_column_size(source_health) <= 32768)
);

create table public.report_items (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  section text not null check (section in (
    'schedule', 'must_do', 'focus', 'internship', 'graduate', 'communication',
    'risk', 'confirmed', 'pending', 'incomplete', 'weekly_summary'
  )),
  position smallint not null check (position between 1 and 100),
  title text not null check (length(title) between 1 and 500),
  reason text check (reason is null or length(reason) <= 2000),
  target_path text check (target_path is null or length(target_path) <= 2048),
  action_id uuid references public.actions(id) on delete set null,
  opportunity_id uuid references public.opportunities(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  source_type text not null check (source_type in ('action', 'opportunity', 'calendar', 'system', 'report')),
  item_state text not null default 'open' check (item_state in ('open', 'confirmed', 'pending', 'completed', 'dismissed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (report_id, section, position),
  constraint report_item_metadata_object check (jsonb_typeof(metadata) = 'object'),
  constraint report_item_metadata_size check (pg_column_size(metadata) <= 16384)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in (
    'interview_invitation', 'deadline_24h', 'schedule_conflict',
    'high_match_expiring', 'connection_failure'
  )),
  dedupe_key text not null check (length(dedupe_key) between 1 and 240),
  title text not null check (length(title) between 1 and 240),
  body text not null check (length(body) between 1 and 1000),
  target_path text check (target_path is null or length(target_path) <= 2048),
  reason text not null check (length(reason) between 1 and 1000),
  status text not null default 'queued' check (status in ('queued', 'delivered', 'failed', 'read', 'suppressed')),
  deliver_after timestamptz not null default now(),
  delivered_at timestamptz,
  read_at timestamptz,
  failure_code text check (failure_code is null or length(failure_code) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index report_schedules_due_idx on public.report_schedules (next_run_at)
  where enabled and next_run_at is not null;
create index reports_user_generated_idx on public.reports (user_id, report_type, generated_at desc);
create index report_items_report_section_idx on public.report_items (report_id, section, position);
create index report_items_user_action_idx on public.report_items (user_id, action_id) where action_id is not null;
create index report_items_user_opportunity_idx on public.report_items (user_id, opportunity_id) where opportunity_id is not null;
create index report_items_calendar_event_idx on public.report_items (calendar_event_id) where calendar_event_id is not null;
create index notifications_delivery_idx on public.notifications (status, deliver_after)
  where status = 'queued';
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);

create trigger report_schedules_set_updated_at before update on public.report_schedules
for each row execute function private.set_updated_at();
create trigger notifications_set_updated_at before update on public.notifications
for each row execute function private.set_updated_at();

create or replace function private.next_report_run_at(
  target_type text,
  target_time time,
  target_weekday smallint,
  target_time_zone text,
  after_time timestamptz default now()
)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  local_now timestamp;
  candidate timestamp;
  day_offset integer;
begin
  local_now := timezone(target_time_zone, after_time);
  if target_type = 'weekly' then
    day_offset := (target_weekday - extract(isodow from local_now)::integer + 7) % 7;
    candidate := (local_now::date + day_offset) + target_time;
    if candidate <= local_now then candidate := candidate + interval '7 days'; end if;
  else
    candidate := local_now::date + target_time;
    if candidate <= local_now then candidate := candidate + interval '1 day'; end if;
  end if;
  return candidate at time zone target_time_zone;
exception when invalid_parameter_value then
  raise exception 'invalid_report_time_zone' using errcode = '22023';
end;
$$;

create or replace function private.set_report_schedule_next_run()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.next_run_at := case when new.enabled then private.next_report_run_at(
    new.report_type, new.local_time, new.weekday, new.time_zone, now()
  ) else null end;
  return new;
end;
$$;

create trigger report_schedule_calculate_next_run
before insert or update of report_type, enabled, local_time, weekday, time_zone
on public.report_schedules
for each row execute function private.set_report_schedule_next_run();

create or replace function public.ensure_my_report_schedules()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  insert into public.report_schedules (user_id, report_type, local_time, weekday)
  values
    (auth.uid(), 'morning', time '08:00', null),
    (auth.uid(), 'evening', time '22:30', null),
    (auth.uid(), 'weekly', time '20:00', 7)
  on conflict (user_id, report_type) do nothing;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function private.insert_report_item(
  target_report_id uuid,
  target_user_id uuid,
  target_section text,
  target_position smallint,
  target_title text,
  target_reason text,
  target_path text,
  target_action_id uuid,
  target_opportunity_id uuid,
  target_calendar_event_id uuid,
  target_source_type text,
  target_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.report_items (
    report_id, user_id, section, position, title, reason, target_path,
    action_id, opportunity_id, calendar_event_id, source_type, metadata
  ) values (
    target_report_id, target_user_id, target_section, target_position, target_title, target_reason,
    target_path, target_action_id, target_opportunity_id, target_calendar_event_id,
    target_source_type, target_metadata
  );
$$;

create or replace function private.generate_report(
  target_user_id uuid,
  target_report_type text,
  target_actor text default 'scheduler',
  target_automation_run_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  permission record;
  report_id uuid;
  report_day date := timezone('Asia/Hong_Kong', now())::date;
  next_version integer;
  item_count integer := 0;
  row_item record;
  track_name text;
  position_counter smallint;
  report_status text;
  report_title text;
  report_summary text;
  health jsonb;
begin
  if target_report_type not in ('morning', 'evening', 'weekly') then
    raise exception 'invalid_report_type' using errcode = '22023';
  end if;
  if auth.uid() is not null and auth.uid() <> target_user_id then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  select * into permission from private.evaluate_permission(target_user_id, 'reports.generate', null);
  if not coalesce(permission.allowed, false) then
    raise exception 'report_permission_denied:%', coalesce(permission.reason, 'unknown') using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || target_report_type || ':' || report_day::text, 0));
  select coalesce(max(version), 0) + 1 into next_version
  from public.reports
  where user_id = target_user_id and report_type = target_report_type and report_date = report_day;

  update public.reports set status = 'superseded'
  where user_id = target_user_id and report_type = target_report_type and report_date = report_day
    and status in ('ready', 'empty');

  select jsonb_build_object(
    'generatedAt', now(),
    'calendar', coalesce((select jsonb_build_object(
      'status', ec.status, 'lastSuccessAt', ec.last_success_at, 'lastErrorCode', ec.last_error_code
    ) from public.external_connections ec where ec.user_id = target_user_id and ec.provider = 'calendar'),
      jsonb_build_object('status', 'disconnected', 'lastSuccessAt', null, 'lastErrorCode', null)),
    'pendingWorkspaceConflicts', (select count(*) from public.sync_conflicts sc where sc.user_id = target_user_id and sc.status = 'pending'),
    'pendingCalendarConflicts', (select count(*) from public.calendar_sync_conflicts cc where cc.user_id = target_user_id and cc.status = 'pending'),
    'unavailableSources', jsonb_build_array('gmail', 'wechat', 'job_radar_ai')
  ) into health;

  report_title := case target_report_type
    when 'morning' then '今日行动简报'
    when 'evening' then '晚间收尾'
    else '本周复盘'
  end;
  report_summary := '规则排序生成；未连接 AI、Gmail 或微信时，不会填充虚假内容。';

  insert into public.reports (
    user_id, report_type, report_date, version, status, title, summary,
    generation_strategy, data_cutoff_at, source_health, automation_run_id
  ) values (
    target_user_id, target_report_type, report_day, next_version, 'empty', report_title,
    report_summary, 'rules_v1', now(), health, target_automation_run_id
  ) returning id into report_id;

  if target_report_type = 'morning' then
    position_counter := 0;
    for row_item in
      select ce.* from public.calendar_events ce
      where ce.user_id = target_user_id and not ce.deleted and ce.status <> 'cancelled'
        and ((ce.all_day and ce.starts_on <= report_day and ce.ends_on > report_day)
          or (not ce.all_day and timezone('Asia/Hong_Kong', ce.starts_at)::date = report_day))
      order by ce.all_day desc, ce.starts_at nulls first, ce.starts_on nulls first
      limit 20
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'schedule', position_counter,
        coalesce(row_item.summary, '无标题日程'), 'Google Calendar 固定安排', '/calendar', null, null,
        row_item.id, 'calendar', jsonb_build_object('allDay', row_item.all_day, 'startsAt', row_item.starts_at, 'startsOn', row_item.starts_on));
      item_count := item_count + 1;
    end loop;

    position_counter := 0;
    for row_item in
      select a.* from public.actions a
      where a.user_id = target_user_id and a.status in ('unscheduled', 'scheduled', 'waiting')
        and a.due_at is not null and a.due_at <= now() + interval '24 hours'
        and coalesce(a.waiting_on, 'user') <> 'other_party'
      order by a.due_at, case a.priority when 'critical' then 0 when 'high' then 1 when 'normal' then 2 else 3 end
      limit 20
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'must_do', position_counter,
        row_item.title, case when row_item.due_at < now() then '已逾期，需要明确处理' else '24 小时内截止' end,
        '/', row_item.id, null, null, 'action', jsonb_build_object('dueAt', row_item.due_at, 'priority', row_item.priority));
      item_count := item_count + 1;
    end loop;

    position_counter := 0;
    for row_item in
      select a.*, (
        case a.priority when 'critical' then 400 when 'high' then 300 when 'normal' then 200 else 100 end
        + case when a.due_at is null then 0 when a.due_at < now() then 180
          when a.due_at <= now() + interval '24 hours' then 140
          when a.due_at <= now() + interval '7 days' then 80 else 20 end
        + case when a.status = 'scheduled' then 30 when a.status = 'waiting' then -80 else 0 end
      ) as focus_score
      from public.actions a
      where a.user_id = target_user_id and a.status in ('unscheduled', 'scheduled', 'waiting')
        and coalesce(a.waiting_on, 'user') <> 'other_party'
      order by focus_score desc, a.due_at nulls last, a.created_at
      limit 3
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'focus', position_counter,
        row_item.title, concat('规则重点：', row_item.priority, ' 优先级', case when row_item.due_at is not null then '，结合截止时间' else '' end),
        '/', row_item.id, null, null, 'action', jsonb_build_object('score', row_item.focus_score, 'strategy', 'rules_v1'));
      item_count := item_count + 1;
    end loop;

    foreach track_name in array array['internship','graduate'] loop
      position_counter := 0;
      for row_item in
        select oc.* from public.opportunity_candidates oc
        where oc.user_id = target_user_id and oc.track = track_name
          and oc.decision_status in ('candidate', 'later')
          and coalesce(oc.qualification_score, 0) >= 3 and coalesce(oc.match_score, 0) >= 3
          and (oc.deadline is null or oc.deadline >= report_day)
        order by (coalesce(oc.qualification_score,0) + coalesce(oc.match_score,0) + coalesce(oc.interest_score,0) + coalesce(oc.urgency_score,0)) desc,
          oc.deadline nulls last, oc.discovered_at desc limit 5
      loop
        position_counter := position_counter + 1;
        perform private.insert_report_item(report_id, target_user_id, track_name, position_counter,
          row_item.company || ' · ' || row_item.role_title,
          concat('资格 ', coalesce(row_item.qualification_score::text, '—'), '/5 · 匹配 ', coalesce(row_item.match_score::text, '—'), '/5'),
          case when track_name = 'internship' then '/internships' else '/graduate' end,
          null, null, null, 'opportunity', jsonb_build_object('candidateId', row_item.id, 'deadline', row_item.deadline));
        item_count := item_count + 1;
      end loop;
    end loop;
  elsif target_report_type = 'evening' then
    position_counter := 0;
    for row_item in
      select a.* from public.actions a
      where a.user_id = target_user_id and a.status in ('unscheduled', 'scheduled', 'waiting')
        and ((a.due_at is not null and timezone('Asia/Hong_Kong', a.due_at)::date <= report_day)
          or (a.suggested_start_at is not null and timezone('Asia/Hong_Kong', a.suggested_start_at)::date = report_day))
      order by a.due_at nulls last, a.updated_at
      limit 30
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'incomplete', position_counter,
        row_item.title, '请明确选择完成、继续、等待、取消或重排；系统不会自动滚动到明天。',
        '/', row_item.id, null, null, 'action', jsonb_build_object('status', row_item.status, 'dueAt', row_item.due_at));
      item_count := item_count + 1;
    end loop;
  else
    position_counter := 0;
    for row_item in
      select track, count(*)::integer as active_count,
        count(*) filter (where main_stage in ('submitted','test','interview','waiting','offer'))::integer as progressed_count
      from public.opportunities
      where user_id = target_user_id and record_state = 'active'
      group by track order by track
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'weekly_summary', position_counter,
        case row_item.track when 'internship' then '实习进度' else '秋招进度' end,
        concat(row_item.active_count, ' 条进行中，', row_item.progressed_count, ' 条已进入投递后阶段。'),
        case row_item.track when 'internship' then '/internships' else '/graduate' end,
        null, null, null, 'report', jsonb_build_object('track', row_item.track));
      item_count := item_count + 1;
    end loop;
    position_counter := position_counter + 1;
    perform private.insert_report_item(report_id, target_user_id, 'weekly_summary', position_counter,
      '学业负荷', concat((select count(*) from public.courses where user_id = target_user_id and record_state = 'active'), ' 门进行中课程；未来 7 天有 ',
      (select count(*) from public.actions where user_id = target_user_id and track = 'academic' and status not in ('completed','cancelled') and due_at between now() and now() + interval '7 days'), ' 个学业行动截止。'),
      '/academics', null, null, null, 'report', '{}'::jsonb);
    item_count := item_count + 1;
  end if;

  position_counter := 0;
  for row_item in
    select 'calendar'::text as kind, 'Calendar 已断开或异常'::text as title,
      '固定日程和冲突覆盖可能不完整。'::text as reason, '/calendar'::text as path
    where not exists (
      select 1 from public.external_connections where user_id = target_user_id and provider = 'calendar' and status = 'connected'
    )
    union all
    select 'workspace_conflict', '有 ' || count(*) || ' 个工作区冲突待处理', '冲突不会被静默覆盖。', '/status'
    from public.sync_conflicts where user_id = target_user_id and status = 'pending' having count(*) > 0
    union all
    select 'calendar_conflict', '有 ' || count(*) || ' 个日历冲突待处理', '需要明确选择产品或 Google 版本。', '/calendar'
    from public.calendar_sync_conflicts where user_id = target_user_id and status = 'pending' having count(*) > 0
  loop
    position_counter := position_counter + 1;
    perform private.insert_report_item(report_id, target_user_id, 'risk', position_counter,
      row_item.title, row_item.reason, row_item.path, null, null, null, 'system', jsonb_build_object('kind', row_item.kind));
    item_count := item_count + 1;
  end loop;

  report_status := case when item_count = 0 then 'empty' else 'ready' end;
  update public.reports set status = report_status,
    summary = case when item_count = 0 then '当前没有可报告内容；未使用占位内容凑数。' else concat('共 ', item_count, ' 条；由可追溯规则生成，数据截止 ', to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI'), '。') end
  where id = report_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state, permission_decision, rule_version, outcome
  ) values (
    target_user_id, target_actor, 'report.generate', 'report', report_id::text,
    jsonb_build_object('type', target_report_type, 'date', report_day, 'version', next_version, 'itemCount', item_count),
    jsonb_build_object('capability', 'reports.generate', 'allowed', true), 'm5-rules-v1', 'succeeded'
  );
  return report_id;
end;
$$;

create or replace function public.generate_my_report(target_report_type text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.generate_report(auth.uid(), target_report_type, 'user', null);
$$;

create or replace function private.generate_due_reports()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare schedule_row public.report_schedules%rowtype;
declare permission record;
declare run_id uuid;
declare generated integer := 0;
declare report_day date;
begin
  for schedule_row in
    select * from public.report_schedules
    where enabled and next_run_at is not null and next_run_at <= now()
    order by next_run_at for update skip locked
  loop
    report_day := timezone(schedule_row.time_zone, schedule_row.next_run_at)::date;
    select * into permission from private.evaluate_permission(schedule_row.user_id, 'reports.generate', null);
    if not coalesce(permission.allowed, false) then
      update public.report_schedules set
        last_run_at = now(), last_status = 'permission_blocked', last_error_code = permission.reason,
        next_run_at = private.next_report_run_at(report_type, local_time, weekday, time_zone, now())
      where id = schedule_row.id;
      continue;
    end if;

    insert into public.automation_runs (
      user_id, capability_key, permission_grant_id, idempotency_key, status,
      progress, safe_checkpoint, permission_snapshot, input_reference, started_at
    ) values (
      schedule_row.user_id, 'reports.generate', permission.grant_id,
      concat('report:', schedule_row.report_type, ':', report_day), 'running', 10, 'permission_checked',
      jsonb_build_object('allowed', true, 'reason', permission.reason),
      jsonb_build_object('reportType', schedule_row.report_type, 'reportDate', report_day), now()
    ) on conflict (user_id, idempotency_key) do nothing returning id into run_id;

    if run_id is null then
      update public.report_schedules set next_run_at = private.next_report_run_at(report_type, local_time, weekday, time_zone, now())
      where id = schedule_row.id;
      continue;
    end if;

    begin
      perform private.generate_report(schedule_row.user_id, schedule_row.report_type, 'scheduler', run_id);
      update public.automation_runs set status = 'succeeded', progress = 100, safe_checkpoint = 'report_ready', finished_at = now()
      where id = run_id;
      update public.report_schedules set last_run_at = now(), last_status = 'ready', last_error_code = null,
        next_run_at = private.next_report_run_at(report_type, local_time, weekday, time_zone, now())
      where id = schedule_row.id;
      generated := generated + 1;
    exception when others then
      update public.automation_runs set status = 'failed', last_error_code = sqlstate,
        last_error_summary = left(sqlerrm, 1000), finished_at = now() where id = run_id;
      update public.report_schedules set last_run_at = now(), last_status = 'failed', last_error_code = sqlstate,
        next_run_at = private.next_report_run_at(report_type, local_time, weekday, time_zone, now())
      where id = schedule_row.id;
    end;
  end loop;
  return generated;
end;
$$;

create or replace function public.enqueue_my_smart_notification(
  target_notification_type text,
  target_dedupe_key text,
  target_title text,
  target_body text,
  target_path text,
  target_reason text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare permission record;
declare notification_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if target_notification_type not in ('interview_invitation', 'deadline_24h', 'schedule_conflict', 'high_match_expiring', 'connection_failure') then
    raise exception 'notification_type_not_allowed' using errcode = '22023';
  end if;
  select * into permission from private.evaluate_permission(auth.uid(), 'notifications.smart_push', null);
  if not coalesce(permission.allowed, false) then
    raise exception 'notification_permission_denied:%', coalesce(permission.reason, 'unknown') using errcode = '42501';
  end if;
  insert into public.notifications (user_id, notification_type, dedupe_key, title, body, target_path, reason)
  values (auth.uid(), target_notification_type, target_dedupe_key, target_title, target_body, target_path, target_reason)
  on conflict (user_id, dedupe_key) do nothing returning id into notification_id;
  return notification_id;
end;
$$;

alter table public.report_schedules enable row level security;
alter table public.reports enable row level security;
alter table public.report_items enable row level security;
alter table public.notifications enable row level security;

create policy report_schedules_own on public.report_schedules for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy report_schedules_service on public.report_schedules for all to service_role
using (true) with check (true);
create policy reports_read_own on public.reports for select to authenticated
using ((select auth.uid()) = user_id);
create policy reports_service on public.reports for all to service_role using (true) with check (true);
create policy report_items_read_own on public.report_items for select to authenticated
using ((select auth.uid()) = user_id);
create policy report_items_service on public.report_items for all to service_role using (true) with check (true);
create policy notifications_read_own on public.notifications for select to authenticated
using ((select auth.uid()) = user_id);
create policy notifications_update_own on public.notifications for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notifications_service on public.notifications for all to service_role using (true) with check (true);

grant select, insert, update, delete on public.report_schedules to authenticated;
grant select on public.reports, public.report_items to authenticated;
grant select on public.notifications to authenticated;
grant update (status, read_at) on public.notifications to authenticated;
grant select, insert, update, delete on public.report_schedules, public.reports, public.report_items, public.notifications to service_role;
grant usage, select on sequence public.report_items_id_seq to service_role;

revoke execute on function private.next_report_run_at(text, time, smallint, text, timestamptz) from public, anon, authenticated;
revoke execute on function private.set_report_schedule_next_run() from public, anon, authenticated;
revoke execute on function private.insert_report_item(uuid, uuid, text, smallint, text, text, text, uuid, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function private.generate_report(uuid, text, text, uuid) from public, anon;
revoke execute on function private.generate_due_reports() from public, anon, authenticated;
grant execute on function private.generate_report(uuid, text, text, uuid) to authenticated, service_role;
grant execute on function private.generate_due_reports() to service_role;

revoke execute on function public.ensure_my_report_schedules() from public, anon;
revoke execute on function public.generate_my_report(text) from public, anon;
revoke execute on function public.enqueue_my_smart_notification(text, text, text, text, text, text) from public, anon;
grant execute on function public.ensure_my_report_schedules() to authenticated, service_role;
grant execute on function public.generate_my_report(text) to authenticated, service_role;
grant execute on function public.enqueue_my_smart_notification(text, text, text, text, text, text) to authenticated, service_role;

-- One small SQL-only dispatcher; it performs no network I/O and records every run.
select cron.schedule(
  'm5-generate-due-reports',
  '*/5 * * * *',
  $$select private.generate_due_reports();$$
);
