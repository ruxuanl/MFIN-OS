-- All synthetic usage/grant/lock changes roll back; never invokes a provider.
begin;
do $$
declare owner uuid; result jsonb; usage uuid; unknown_usage uuid; spent integer;
begin
 select u.id into owner from auth.users u where not exists(
  select 1 from public.privacy_locks p where p.user_id=u.id and p.is_locked) limit 1;
 if owner is null then raise exception 'unlocked_test_owner_required'; end if;
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claim.sub',owner::text,true);
 insert into public.permission_grants(user_id,capability_key,mode,active) values(owner,'ai.master','persistent',true),(owner,'ai.interview','persistent',true)
 on conflict(user_id,capability_key) do update set mode='persistent',active=true,expires_at=null,operation_id=null,starts_at=now();
 result:=public.interview_ai_work(owner,'check');
 if not (result->>'allowed')::boolean then raise exception 'enabled_gate_failed'; end if;
 -- Disabling the interview permission must reject a reservation before any spend.
 update public.permission_grants set active=false where user_id=owner and capability_key='ai.interview';
 begin
  perform public.interview_ai_work(owner,'reserve',jsonb_build_object('reserve',1,'fingerprint',repeat('d',64)));
  raise exception 'disabled_permission_was_allowed';
 exception when insufficient_privilege then null; end;
 update public.permission_grants set active=true where user_id=owner and capability_key='ai.interview';
 -- Fill the remaining shared monthly budget using synthetic reservation data only.
 select coalesce(sum(case when status='completed' then actual_hkd_cents else reserved_hkd_cents end),0) into spent
 from public.ai_usage_events where user_id=owner and status in ('reserved','completed')
 and created_at >= (date_trunc('month',now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong');
 if spent>=10000 then raise exception 'test_owner_budget_already_full'; end if;
 insert into public.ai_usage_events(user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,provider)
 values(owner,'interview',repeat('e',64),10000-spent,'deepseek') returning id into usage;
 begin
  perform public.interview_ai_work(owner,'reserve',jsonb_build_object('reserve',1,'fingerprint',repeat('f',64)));
  raise exception 'exhausted_budget_was_allowed';
 exception when raise_exception then
  if sqlerrm <> 'ai_monthly_budget_exceeded' then raise; end if;
 end;
 delete from public.ai_usage_events where id=usage;
 result:=public.interview_ai_work(owner,'reserve',jsonb_build_object('reserve',30,'fingerprint',repeat('a',64)));usage:=(result->>'usageId')::uuid;
 result:=public.interview_ai_work(owner,'settle',jsonb_build_object('usageId',usage,'model','deepseek-flash','inputTokens',100,'outputTokens',100,'cost',1));
 if not exists(select 1 from public.ai_usage_events where id=usage and status='completed' and actual_hkd_cents=1 and provider='deepseek') then raise exception 'settlement_failed'; end if;
 if not exists(select 1 from public.audit_events where object_id=usage::text and actor_type='ai') then raise exception 'audit_failed'; end if;
 result:=public.interview_ai_work(owner,'reserve',jsonb_build_object('reserve',20,'fingerprint',repeat('b',64)));unknown_usage:=(result->>'usageId')::uuid;
 perform public.interview_ai_work(owner,'uncertain',jsonb_build_object('usageId',unknown_usage));
 if not exists(select 1 from public.ai_usage_events where id=unknown_usage and status='reserved' and error_code='interview_usage_unsettled') then raise exception 'unknown_usage_released'; end if;
 insert into public.privacy_locks(user_id,is_locked,locked_at) values(owner,true,now())
 on conflict(user_id) do update set is_locked=true,locked_at=now();
 if (public.interview_ai_work(owner,'check')->>'allowed')::boolean then raise exception 'lock_gate_failed'; end if;
 begin
  perform public.interview_ai_work(owner,'reserve',jsonb_build_object('reserve',1,'fingerprint',repeat('c',64)));
  raise exception 'locked_reserve_was_allowed';
 exception when insufficient_privilege then null; end;
 -- Settlement must still record known costs after a privacy lock, without returning a usable answer.
 result:=public.interview_ai_work(owner,'settle',jsonb_build_object('usageId',unknown_usage,'model','deepseek-flash','inputTokens',10,'outputTokens',10,'cost',1));
 if (result->>'allowed')::boolean then raise exception 'locked_result_exposed'; end if;
 perform set_config('request.jwt.claim.role','authenticated',true);
 begin
  perform public.interview_ai_work(owner,'check');raise exception 'non_service_was_allowed';
 exception when insufficient_privilege then null; end;
end;
$$;
rollback;
