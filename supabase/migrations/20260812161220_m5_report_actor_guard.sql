-- M5: authenticated clients must use the public wrapper so audit actors cannot
-- be forged as scheduler/system roles.

revoke execute on function private.generate_report(uuid, text, text, uuid)
from authenticated;
grant execute on function private.generate_report(uuid, text, text, uuid)
to service_role;

create or replace function public.generate_my_report(target_report_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  return private.generate_report(auth.uid(), target_report_type, 'user', null);
end;
$$;

revoke execute on function public.generate_my_report(text) from public, anon;
grant execute on function public.generate_my_report(text) to authenticated, service_role;
