-- M5 client-write boundary (ordered before M6): users configure schedules through narrow RPCs,
-- while scheduler state and notification delivery state remain system-owned.

alter function public.ensure_my_report_schedules() set schema private;
alter function private.ensure_my_report_schedules() security definer;

revoke all on function private.ensure_my_report_schedules() from public, anon;
grant execute on function private.ensure_my_report_schedules() to authenticated, service_role;

create function public.ensure_my_report_schedules()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.ensure_my_report_schedules();
$$;

revoke all on function public.ensure_my_report_schedules() from public, anon;
grant execute on function public.ensure_my_report_schedules() to authenticated, service_role;

create function private.update_my_report_schedule(
  target_report_type text,
  target_enabled boolean,
  target_local_time time
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_report_type not in ('morning', 'evening', 'weekly') then
    raise exception 'invalid_report_type' using errcode = '22023';
  end if;
  if target_enabled is null or target_local_time is null then
    raise exception 'invalid_schedule_configuration' using errcode = '22023';
  end if;

  perform private.ensure_my_report_schedules();

  update public.report_schedules
  set enabled = target_enabled,
      local_time = target_local_time
  where user_id = auth.uid()
    and report_type = target_report_type
  returning jsonb_build_object(
    'reportType', report_type,
    'enabled', enabled,
    'localTime', local_time,
    'nextRunAt', next_run_at
  ) into result;

  if result is null then
    raise exception 'report_schedule_not_found' using errcode = 'P0002';
  end if;
  return result;
end;
$$;

create function public.update_my_report_schedule(
  target_report_type text,
  target_enabled boolean,
  target_local_time time
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.update_my_report_schedule(target_report_type, target_enabled, target_local_time);
$$;

revoke all on function private.update_my_report_schedule(text, boolean, time) from public, anon;
grant execute on function private.update_my_report_schedule(text, boolean, time) to authenticated, service_role;
revoke all on function public.update_my_report_schedule(text, boolean, time) from public, anon;
grant execute on function public.update_my_report_schedule(text, boolean, time) to authenticated, service_role;

revoke insert, update, delete on public.report_schedules from authenticated;
grant select on public.report_schedules to authenticated;

alter function public.enqueue_my_smart_notification(text, text, text, text, text, text) set schema private;
alter function private.enqueue_my_smart_notification(text, text, text, text, text, text) security definer;

revoke all on function private.enqueue_my_smart_notification(text, text, text, text, text, text) from public, anon;
grant execute on function private.enqueue_my_smart_notification(text, text, text, text, text, text) to authenticated, service_role;

create function public.enqueue_my_smart_notification(
  target_notification_type text,
  target_dedupe_key text,
  target_title text,
  target_body text,
  target_path text,
  target_reason text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.enqueue_my_smart_notification(
    target_notification_type,
    target_dedupe_key,
    target_title,
    target_body,
    target_path,
    target_reason
  );
$$;

revoke all on function public.enqueue_my_smart_notification(text, text, text, text, text, text) from public, anon;
grant execute on function public.enqueue_my_smart_notification(text, text, text, text, text, text) to authenticated, service_role;

revoke update (status, read_at) on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;
