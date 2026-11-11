-- M5 public RPC follows the established M4 boundary: a public invoker wrapper
-- delegates to a private definer implementation with an explicit auth.uid check.

alter function public.generate_my_report(text) set schema private;

create function public.generate_my_report(target_report_type text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.generate_my_report($1);
$$;

revoke execute on function private.generate_my_report(text) from public, anon;
grant execute on function private.generate_my_report(text) to authenticated, service_role;
revoke execute on function public.generate_my_report(text) from public, anon;
grant execute on function public.generate_my_report(text) to authenticated, service_role;
