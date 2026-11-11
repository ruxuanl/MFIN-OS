-- M4 follow-up hardening. The original migration is already applied to the
-- isolated test project, so fixes remain append-only and reproducible.

alter function public.queue_action_calendar_sync(uuid, boolean) security definer;
alter function public.set_my_calendar_connection_status(text) security definer;
alter function public.resolve_calendar_sync_conflict(uuid, text) security definer;

create or replace function private.supersede_calendar_sync_operation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_operation public.calendar_sync_operations%rowtype;
begin
  select * into active_operation
  from public.calendar_sync_operations
  where event_link_id = new.event_link_id
    and status in ('pending', 'processing')
  order by created_at desc
  limit 1
  for update;

  if not found then
    return new;
  end if;

  -- A processing operation already reads the latest Action projection. Reuse
  -- its idempotency key so INSERT ... ON CONFLICT updates that operation rather
  -- than creating a second external write.
  if active_operation.status = 'processing' then
    new.idempotency_key := active_operation.idempotency_key;
    return new;
  end if;

  update public.calendar_sync_operations
  set status = 'cancelled',
      last_error_code = 'superseded',
      finished_at = now()
  where id = active_operation.id;

  return new;
end;
$$;

drop trigger if exists calendar_sync_operations_supersede_active
  on public.calendar_sync_operations;
create trigger calendar_sync_operations_supersede_active
before insert on public.calendar_sync_operations
for each row execute function private.supersede_calendar_sync_operation();

-- Resuming a connection must release operations blocked only by a pause. Any
-- live permission denial is recomputed by the server immediately before I/O.
create or replace function private.clear_resumed_calendar_operation_blocks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'paused' and new.status = 'connected' and new.provider = 'calendar' then
    update public.calendar_sync_operations
    set blocked_reason = null
    where user_id = new.user_id
      and status = 'pending'
      and blocked_reason in ('connection_paused', 'connection_unavailable');
  end if;
  return new;
end;
$$;

drop trigger if exists external_connections_clear_calendar_pause
  on public.external_connections;
create trigger external_connections_clear_calendar_pause
after update of status on public.external_connections
for each row execute function private.clear_resumed_calendar_operation_blocks();

revoke execute on function private.supersede_calendar_sync_operation() from public, anon, authenticated;
revoke execute on function private.clear_resumed_calendar_operation_blocks() from public, anon, authenticated;
revoke execute on function public.queue_action_calendar_sync(uuid, boolean) from public, anon;
revoke execute on function public.set_my_calendar_connection_status(text) from public, anon;
revoke execute on function public.resolve_calendar_sync_conflict(uuid, text) from public, anon;
grant execute on function public.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function public.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;
