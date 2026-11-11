-- Align pause-time permission reasons with the resume trigger.

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

update public.calendar_sync_operations operation
set blocked_reason = null
from public.external_connections connection
where connection.user_id = operation.user_id
  and connection.provider = 'calendar'
  and connection.status = 'connected'
  and operation.status = 'pending'
  and operation.blocked_reason in ('connection_paused', 'connection_unavailable');

revoke execute on function private.clear_resumed_calendar_operation_blocks()
from public, anon, authenticated;
