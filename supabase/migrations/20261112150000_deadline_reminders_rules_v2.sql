-- Issue #19: tiered deadline reminders and a rules_v2 morning top three.
-- * Morning reports gain a "deadline" section: jobs and candidates 7 / 3 / 1 days before their
--   deadline and on the day itself (constitution 7.1).
-- * Only deadlines inside the next 24 hours become an instant notification (constitution 7.2),
--   gated by notifications.smart_push and de-duplicated per object + deadline.
-- * The top three ("focus") now ranks open actions together with unfinished application packages
--   (rules_v2, labelled as not AI). Reports keep data_cutoff_at; generation_strategy is rules_v2.

alter table public.reports drop constraint reports_generation_strategy_check;
alter table public.reports add constraint reports_generation_strategy_check
  check (generation_strategy in ('rules_v1', 'rules_v2', 'ai'));

alter table public.report_items drop constraint report_items_section_check;
alter table public.report_items add constraint report_items_section_check check (section in (
  'schedule', 'must_do', 'deadline', 'focus', 'internship', 'graduate', 'communication',
  'risk', 'confirmed', 'pending', 'incomplete', 'weekly_summary'
));

-- Deadlines are dates; like application packages (#13) they are treated as 18:00 Hong Kong time.
create function private.enqueue_deadline_notifications(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision record;
  queued integer := 0;
begin
  if auth.uid() is not null and auth.uid() <> target_user_id then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select * into decision from private.evaluate_permission(target_user_id, 'notifications.smart_push', null);
  if not coalesce(decision.allowed, false) then
    return 0;
  end if;

  insert into public.notifications (user_id, notification_type, dedupe_key, title, body, target_path, reason)
  select target_user_id, 'deadline_24h',
    'deadline_24h:' || due.kind || ':' || due.id::text || ':' || due.deadline::text,
    left('24 小时内截止：' || due.company || ' · ' || due.role_title, 240),
    '截止 ' || to_char(due.deadline_at at time zone 'Asia/Hong_Kong', 'MM-DD HH24:MI') || '（香港时间）。系统不会代你提交。',
    due.path, '截止前 24 小时内（宪法 7.2）· rules_v2'
  from (
    select 'opportunity'::text as kind, o.id, o.company, o.role_title, o.deadline,
      (o.deadline + time '18:00') at time zone 'Asia/Hong_Kong' as deadline_at,
      case when o.track = 'internship' then '/internships/' else '/graduate/' end || o.id::text as path
    from public.opportunities o
    where o.user_id = target_user_id and o.record_state = 'active'
      and o.main_stage in ('new', 'evaluation', 'preparation') and o.deadline is not null
    union all
    select 'candidate', oc.id, oc.company, oc.role_title, oc.deadline,
      (oc.deadline + time '18:00') at time zone 'Asia/Hong_Kong',
      case when oc.track = 'internship' then '/internships' else '/graduate' end
    from public.opportunity_candidates oc
    where oc.user_id = target_user_id and oc.decision_status in ('candidate', 'later') and oc.deadline is not null
  ) due
  where due.deadline_at > now() and due.deadline_at <= now() + interval '24 hours'
  on conflict (user_id, dedupe_key) do nothing;
  get diagnostics queued = row_count;
  return queued;
end;
$$;

-- Hourly sweep so the 24-hour push does not depend on the morning report time.
create function private.enqueue_due_deadline_notifications()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  total integer := 0;
begin
  for owner_id in
    select distinct user_id from public.opportunities
    where deadline between (now() at time zone 'Asia/Hong_Kong')::date and (now() at time zone 'Asia/Hong_Kong')::date + 1
    union
    select distinct user_id from public.opportunity_candidates
    where deadline between (now() at time zone 'Asia/Hong_Kong')::date and (now() at time zone 'Asia/Hong_Kong')::date + 1
  loop
    total := total + private.enqueue_deadline_notifications(owner_id);
  end loop;
  return total;
end;
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
  report_summary := '规则排序生成（rules_v2，非 AI）；未连接的数据源不会被虚假内容填充。';

  insert into public.reports (
    user_id, report_type, report_date, version, status, title, summary,
    generation_strategy, data_cutoff_at, source_health, automation_run_id
  ) values (
    target_user_id, target_report_type, report_day, next_version, 'empty', report_title,
    report_summary, 'rules_v2', now(), health, target_automation_run_id
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

    -- Deadline reminders: 7 / 3 / 1 days before, plus the day itself (constitution 7.1).
    position_counter := 0;
    for row_item in
      select * from (
        select 'opportunity'::text as kind, o.id, o.track, o.company, o.role_title, o.deadline,
          (o.deadline - report_day) as days_left
        from public.opportunities o
        where o.user_id = target_user_id and o.record_state = 'active'
          and o.main_stage in ('new', 'evaluation', 'preparation')
          and o.deadline is not null and (o.deadline - report_day) in (0, 1, 3, 7)
        union all
        select 'candidate', oc.id, oc.track, oc.company, oc.role_title, oc.deadline,
          (oc.deadline - report_day)
        from public.opportunity_candidates oc
        where oc.user_id = target_user_id and oc.decision_status in ('candidate', 'later')
          and oc.deadline is not null and (oc.deadline - report_day) in (0, 1, 3, 7)
      ) due
      order by due.days_left, due.company, due.id
      limit 30
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'deadline', position_counter,
        row_item.company || ' · ' || row_item.role_title,
        case when row_item.days_left = 0 then '今天截止（香港时间）'
          else concat('还有 ', row_item.days_left, ' 天截止（7/3/1 天提醒）') end,
        case when row_item.kind = 'opportunity'
          then case when row_item.track = 'internship' then '/internships/' else '/graduate/' end || row_item.id::text
          else case when row_item.track = 'internship' then '/internships' else '/graduate' end end,
        null, case when row_item.kind = 'opportunity' then row_item.id end, null, 'opportunity',
        jsonb_build_object('kind', row_item.kind, 'candidateId', case when row_item.kind = 'candidate' then row_item.id end,
          'deadline', row_item.deadline, 'daysLeft', row_item.days_left, 'strategy', 'rules_v2'));
      item_count := item_count + 1;
    end loop;

    -- Top three (rules_v2, not AI): open actions and unfinished application packages ranked together.
    -- A package replaces its own deadline action so the same job never takes two slots.
    position_counter := 0;
    for row_item in
      select * from (
        select 'action'::text as kind, a.id as action_id, null::uuid as opportunity_id, a.title,
          a.priority, a.due_at, a.created_at, '/'::text as path, null::integer as missing_items, null::text as package_status,
          (case a.priority when 'critical' then 400 when 'high' then 300 when 'normal' then 200 else 100 end
            + case when a.due_at is null then 0 when a.due_at < now() then 180
              when a.due_at <= now() + interval '24 hours' then 140
              when a.due_at <= now() + interval '7 days' then 80 else 20 end
            + case when a.status = 'scheduled' then 30 when a.status = 'waiting' then -80 else 0 end) as focus_score
        from public.actions a
        where a.user_id = target_user_id and a.status in ('unscheduled', 'scheduled', 'waiting')
          and coalesce(a.waiting_on, 'user') <> 'other_party'
          and not exists (
            select 1 from public.application_packages p
            where p.deadline_action_id = a.id and p.status in ('draft', 'ready')
          )
        union all
        select 'package', p.deadline_action_id, o.id,
          '推进投递包：' || o.company || ' · ' || o.role_title,
          'high', pkg_due.due_at, p.created_at,
          case when o.track = 'internship' then '/internships/' else '/graduate/' end || o.id::text,
          pkg_missing.missing, p.status,
          (300
            + case when pkg_due.due_at is null then 0 when pkg_due.due_at < now() then 180
              when pkg_due.due_at <= now() + interval '24 hours' then 140
              when pkg_due.due_at <= now() + interval '7 days' then 80 else 20 end
            + case when pkg_missing.missing > 0 then 40 else 20 end)
        from public.application_packages p
        join public.opportunities o on o.id = p.opportunity_id and o.record_state = 'active'
        left join public.actions da on da.id = p.deadline_action_id
        cross join lateral (
          select coalesce(da.due_at, (o.deadline + time '18:00') at time zone 'Asia/Hong_Kong') as due_at
        ) pkg_due
        cross join lateral (
          select count(*)::integer as missing from public.application_package_items i
          where i.package_id = p.id and i.required and not i.done
        ) pkg_missing
        where p.user_id = target_user_id and p.status in ('draft', 'ready')
      ) ranked
      order by ranked.focus_score desc, ranked.due_at nulls last, ranked.created_at
      limit 3
    loop
      position_counter := position_counter + 1;
      perform private.insert_report_item(report_id, target_user_id, 'focus', position_counter,
        row_item.title,
        case when row_item.kind = 'package' then
          case when row_item.missing_items > 0 then concat('规则重点（非 AI）：投递包还缺 ', row_item.missing_items, ' 项必需材料')
            else '规则重点（非 AI）：材料已齐，请按截止在官网提交（系统不代为提交）' end
        else concat('规则重点（非 AI）：', row_item.priority, ' 优先级', case when row_item.due_at is not null then '，结合截止时间' else '' end) end,
        row_item.path, row_item.action_id, row_item.opportunity_id, null,
        case when row_item.kind = 'package' then 'opportunity' else 'action' end,
        jsonb_build_object('kind', row_item.kind, 'score', row_item.focus_score, 'strategy', 'rules_v2',
          'missingItems', row_item.missing_items, 'dueAt', row_item.due_at));
      item_count := item_count + 1;
    end loop;

    perform private.enqueue_deadline_notifications(target_user_id);

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
    summary = case when item_count = 0 then '当前没有可报告内容；未使用占位内容凑数。' else concat('共 ', item_count, ' 条；rules_v2 规则生成（非 AI），数据截止 ', to_char(now() at time zone 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI'), '。') end
  where id = report_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state, permission_decision, rule_version, outcome
  ) values (
    target_user_id, target_actor, 'report.generate', 'report', report_id::text,
    jsonb_build_object('type', target_report_type, 'date', report_day, 'version', next_version, 'itemCount', item_count),
    jsonb_build_object('capability', 'reports.generate', 'allowed', true), 'rules_v2', 'succeeded'
  );
  return report_id;
end;
$$;

revoke all on function private.enqueue_deadline_notifications(uuid) from public, anon, authenticated;
grant execute on function private.enqueue_deadline_notifications(uuid) to service_role;
revoke all on function private.enqueue_due_deadline_notifications() from public, anon, authenticated;
grant execute on function private.enqueue_due_deadline_notifications() to service_role;
revoke execute on function private.generate_report(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function private.generate_report(uuid, text, text, uuid) to service_role;

select cron.schedule(
  'm19-deadline-24h-notifications',
  '7 * * * *',
  $$select private.enqueue_due_deadline_notifications();$$
);
