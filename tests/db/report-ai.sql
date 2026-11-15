-- Run only in the isolated Test project. All changes roll back.
begin;
select set_config('request.jwt.claim.role','service_role',true);
do $$
declare owner uuid; result jsonb; reservation jsonb;
begin
 select user_id into owner from public.permission_grants where capability_key='reports.generate' limit 1;
 if owner is null then raise exception 'test_owner_required'; end if;
 result:=public.report_ai_work(owner,'check');
 if not (result->>'allowed')::boolean then raise exception 'expected_active_report_permission'; end if;
 reservation:=public.report_ai_work(owner,'reserve',jsonb_build_object('reserve',1,'fingerprint',repeat('a',64)));
 perform public.report_ai_work(owner,'cancel',jsonb_build_object('usageId',reservation->>'usageId'));
 begin
  perform public.report_ai_work(owner,'reserve',jsonb_build_object('reserve',10000,'fingerprint',repeat('b',64)));
  raise exception 'budget_should_fail';
 exception when others then
  if sqlerrm <> 'ai_monthly_budget_exceeded' then raise; end if;
 end;
 update public.permission_grants set active=false where user_id=owner and capability_key='ai.master';
 result:=public.report_ai_work(owner,'check');
 if (result->>'allowed')::boolean then raise exception 'ai_master_not_enforced'; end if;
 update public.permission_grants set active=true where user_id=owner and capability_key='ai.master';
 begin
 insert into public.privacy_locks(user_id,is_locked,locked_at) values(owner,true,now()) on conflict(user_id) do update set is_locked=true,locked_at=now();
 result:=public.report_ai_work(owner,'check');
 if (result->>'allowed')::boolean then raise exception 'privacy_lock_not_enforced'; end if;
 raise exception 'rollback_privacy_probe';
 exception when others then
  if sqlerrm <> 'rollback_privacy_probe' then raise; end if;
 end;
 update public.permission_grants set active=false where user_id=owner and capability_key='reports.generate';
 result:=public.report_ai_work(owner,'check');
 if (result->>'allowed')::boolean then raise exception 'revocation_not_enforced'; end if;
 begin
  perform public.report_ai_work(owner,'reserve',jsonb_build_object('reserve',1,'fingerprint',repeat('a',64)));
  raise exception 'reserve_should_fail';
 exception when insufficient_privilege then null;
 end;
 if has_function_privilege('anon','public.report_ai_work(uuid,text,jsonb)','execute')
  or has_function_privilege('authenticated','public.report_ai_work(uuid,text,jsonb)','execute')
  or not has_function_privilege('service_role','public.report_ai_work(uuid,text,jsonb)','execute') then raise exception 'invalid_grants'; end if;
end $$;
rollback;
