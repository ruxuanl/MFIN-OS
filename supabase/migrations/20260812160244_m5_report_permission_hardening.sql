-- M5 hardening discovered during isolated remote verification.
-- Deterministic rules reports obey the report switch and privacy lock but do not
-- require the still-unselected AI provider/master switch.

update public.capability_definitions
set description = '使用可追溯规则生成晨报、晚间收尾和周报；AI 增强另受 AI 总开关控制。',
    requires_ai = false,
    supports_once = false,
    updated_at = now()
where capability_key = 'reports.generate';

create or replace function public.generate_my_report(target_report_type text)
returns uuid
language plpgsql
security invoker
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
