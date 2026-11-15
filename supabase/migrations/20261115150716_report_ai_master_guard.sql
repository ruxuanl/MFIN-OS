-- Reports require both the existing report grant and AI master. Fingerprint all permission dependencies.
-- Bind the service-only operation to its authenticated host owner before using existing permission helpers.
create or replace function public.report_ai_work(target_user_id uuid,target_action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 permitted boolean; revision text; uid uuid; reserved integer; spent integer;
 usage public.ai_usage_events%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required' using errcode='42501'; end if;
 if target_user_id is null then raise exception 'owner_required'; end if;
 perform set_config('request.jwt.claim.sub',target_user_id::text,true);
 permitted:=private.m3_writes_allowed(target_user_id) and exists(
  select 1 from private.evaluate_permission(target_user_id,'reports.generate',null) where allowed) and exists(
  select 1 from private.evaluate_permission(target_user_id,'ai.master',null) where allowed);
 select md5(coalesce(string_agg(capability_key||':'||updated_at::text,',' order by capability_key),'')) into revision
 from public.permission_grants where user_id=target_user_id;
 revision:=revision||':'||coalesce((select updated_at::text from public.privacy_locks where user_id=target_user_id),'none');
 if target_action='check' then return jsonb_build_object('allowed',permitted,'revision',revision); end if;
 if target_action='reserve' then
  if not permitted then raise exception 'report_ai_permission_denied' using errcode='42501'; end if;
  reserved:=(payload->>'reserve')::integer;
  if reserved is null or reserved not between 1 and 10000 or payload->>'fingerprint' is null
   or (payload->>'fingerprint') !~ '^[0-9a-f]{64}$' then raise exception 'invalid_reservation'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text||':ai_budget',0));
  select coalesce(sum(case when status='completed' then actual_hkd_cents else reserved_hkd_cents end),0) into spent
  from public.ai_usage_events where user_id=target_user_id
   and created_at >= (date_trunc('month',now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong')
   and status in ('reserved','completed');
  if spent+reserved>10000 then raise exception 'ai_monthly_budget_exceeded'; end if;
  insert into public.ai_usage_events(user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,provider)
  values(target_user_id,'report',payload->>'fingerprint',reserved,'deepseek') returning id into uid;
  return jsonb_build_object('usageId',uid,'revision',revision);
 end if;
 select * into usage from public.ai_usage_events where id=(payload->>'usageId')::uuid
  and user_id=target_user_id and analysis_kind='report' for update;
 if not found then raise exception 'reservation_not_found'; end if;
 if target_action='settle' then
  if usage.status='completed' then return jsonb_build_object('allowed',permitted,'revision',revision); end if;
  if usage.status<>'reserved' or payload->>'cost' is null or payload->>'inputTokens' is null or payload->>'outputTokens' is null
   or (payload->>'cost')::integer not between 0 and usage.reserved_hkd_cents
   or (payload->>'inputTokens')::integer<0 or (payload->>'outputTokens')::integer<0
   or payload->>'model' is null or length(payload->>'model') not between 1 and 120
   or (payload->>'model') not like 'deepseek-%' then raise exception 'invalid_usage'; end if;
  update public.ai_usage_events set status='completed',model=payload->>'model',actual_hkd_cents=(payload->>'cost')::integer,
   input_tokens=(payload->>'inputTokens')::integer,output_tokens=(payload->>'outputTokens')::integer,finished_at=now() where id=usage.id;
  insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
  values(target_user_id,'ai','report.ai_completed','ai_usage',usage.id::text,
   jsonb_build_object('actualHkdCents',(payload->>'cost')::integer,'model',payload->>'model'),'succeeded');
  return jsonb_build_object('allowed',permitted,'revision',revision);
 elsif target_action='uncertain' then
  -- Do not release a possibly billed reservation on timeout/unknown usage.
  update public.ai_usage_events set error_code='report_usage_unsettled' where id=usage.id and status='reserved';
  return 'true';
 elsif target_action='cancel' then
  update public.ai_usage_events set status='cancelled',finished_at=now() where id=usage.id and status='reserved';
  return 'true';
 end if;
 raise exception 'invalid_action';
end;
$$;

revoke all on function public.report_ai_work(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.report_ai_work(uuid,text,jsonb) to service_role;
