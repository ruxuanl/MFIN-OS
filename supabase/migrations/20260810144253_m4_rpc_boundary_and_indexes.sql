-- Keep elevated write implementations outside the Data API schema. Public
-- wrappers remain SECURITY INVOKER and only forward the authenticated identity
-- into private functions that enforce auth.uid(), privacy lock, and ownership.
alter function public.queue_action_calendar_sync(uuid, boolean) set schema private;
alter function public.set_my_calendar_connection_status(text) set schema private;
alter function public.resolve_calendar_sync_conflict(uuid, text) set schema private;

create function public.queue_action_calendar_sync(
  target_action_id uuid,
  target_all_day boolean default false
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.queue_action_calendar_sync($1, $2);
$$;

create function public.set_my_calendar_connection_status(target_status text)
returns text
language sql
security invoker
set search_path = ''
as $$
  select private.set_my_calendar_connection_status($1);
$$;

create function public.resolve_calendar_sync_conflict(
  target_conflict_id uuid,
  target_resolution text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_calendar_sync_conflict($1, $2);
$$;

grant usage on schema private to authenticated, service_role;
revoke execute on function private.queue_action_calendar_sync(uuid, boolean) from public, anon;
revoke execute on function private.set_my_calendar_connection_status(text) from public, anon;
revoke execute on function private.resolve_calendar_sync_conflict(uuid, text) from public, anon;
grant execute on function private.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function private.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function private.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;

revoke execute on function public.queue_action_calendar_sync(uuid, boolean) from public, anon;
revoke execute on function public.set_my_calendar_connection_status(text) from public, anon;
revoke execute on function public.resolve_calendar_sync_conflict(uuid, text) from public, anon;
grant execute on function public.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function public.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;

create index calendar_event_links_action_id_idx
  on public.calendar_event_links (action_id);
create index calendar_event_links_calendar_event_id_idx
  on public.calendar_event_links (calendar_event_id)
  where calendar_event_id is not null;
create index calendar_events_product_action_fk_idx
  on public.calendar_events (product_action_id)
  where product_action_id is not null;
create index calendar_sources_connection_id_idx
  on public.calendar_sources (connection_id);
create index calendar_sync_operations_capability_key_idx
  on public.calendar_sync_operations (capability_key);
