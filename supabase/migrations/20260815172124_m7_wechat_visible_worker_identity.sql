-- The local worker may omit a persisted user id in this permanently
-- single-user product. A service-only RPC returns an id only while Auth has
-- exactly one user; it fails closed if the deployment ever stops being single-user.

create function private.get_single_wechat_monitor_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  user_count integer;
  only_user_id uuid;
begin
  select count(*)::integer, min(id::text)::uuid
  into user_count, only_user_id
  from auth.users;

  if user_count <> 1 or only_user_id is null then
    raise exception 'single_user_invariant_failed' using errcode = '55000';
  end if;
  return only_user_id;
end;
$$;

revoke execute on function private.get_single_wechat_monitor_user_id()
  from public, anon, authenticated;
grant execute on function private.get_single_wechat_monitor_user_id()
  to service_role;

create function public.get_single_wechat_monitor_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select private.get_single_wechat_monitor_user_id();
$$;

revoke execute on function public.get_single_wechat_monitor_user_id()
  from public, anon, authenticated;
grant execute on function public.get_single_wechat_monitor_user_id()
  to service_role;
