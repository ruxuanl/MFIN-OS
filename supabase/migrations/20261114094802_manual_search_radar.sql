-- #48: manual cross-site discovery. Private staging; no cron or automatic candidate projection.
create table private.radar_runs (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 preferences jsonb not null, status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
 error text, created_at timestamptz not null default now(), finished_at timestamptz,
 search_provider text not null default 'tavily', search_credit_limit integer not null default 1,
 ai_usage_id uuid references public.ai_usage_events(id), ai_model text
);
create index radar_runs_owner on private.radar_runs(user_id,created_at desc);
create index radar_runs_usage on private.radar_runs(ai_usage_id);
create table private.radar_results (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 run_id uuid not null references private.radar_runs(id) on delete cascade,
 url text not null check (length(url) <= 2048 and url like 'https://%'), item jsonb not null,
 status text not null default 'pending' check (status in ('pending','added','ignored')),
 candidate_id uuid references public.opportunity_candidates(id) on delete set null,
 created_at timestamptz not null default now(), unique(user_id,url)
);
create index radar_results_run on private.radar_results(run_id);
create index radar_results_candidate on private.radar_results(candidate_id);
alter table private.radar_runs enable row level security;
alter table private.radar_results enable row level security;
revoke all on private.radar_runs, private.radar_results from public, anon, authenticated;

create function private.manual_radar(target_action text, payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 uid uuid := auth.uid(); rid uuid; r private.radar_runs%rowtype; result private.radar_results%rowtype;
 item jsonb; cid uuid; usage public.ai_usage_events%rowtype; decision record;
begin
 if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if target_action = 'read' then
  return jsonb_build_object(
   'preferences',(select preferences from private.radar_runs where user_id=uid order by created_at desc limit 1),
   'runs',coalesce((select jsonb_agg(to_jsonb(x)) from (select id,status,error,created_at from private.radar_runs where user_id=uid order by created_at desc limit 5) x),'[]'::jsonb),
   'items',coalesce((select jsonb_agg(x.item || jsonb_build_object('id',x.id,'status',x.status,'discoveredAt',x.created_at)) from
    (select * from private.radar_results where user_id=uid order by created_at desc limit 40) x),'[]'::jsonb));
 end if;
 if not private.m3_writes_allowed(uid) then raise exception 'privacy_locked' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text || ':manual_radar',0));
 if target_action = 'start' then
  select * into decision from private.evaluate_permission(uid,'job_radar.discovery',null);
  if not coalesce(decision.allowed,false) then raise exception 'radar_permission_denied:%',decision.reason using errcode='42501'; end if;
  if payload is null or jsonb_typeof(payload)<>'object' or pg_column_size(payload)>4096
    or length(payload->>'profile') not between 1 and 600
    or length(payload->>'direction') not between 1 and 120
    or length(payload->>'region') not between 1 and 120
    or length(payload->>'internshipType') not between 1 and 120 then raise exception 'invalid_conditions'; end if;
  if exists(select 1 from private.radar_runs where user_id=uid and
     (created_at>now()-interval '60 seconds' or (status='running' and created_at>now()-interval '3 minutes')))
    then raise exception 'radar_busy'; end if;
  if (select count(*) from private.radar_runs where user_id=uid and created_at>now()-interval '24 hours')>=20 then raise exception 'radar_daily_limit'; end if;
  update private.radar_runs set status='failed',error='run_interrupted',finished_at=now() where user_id=uid and status='running';
  insert into private.radar_runs(user_id,preferences) values(uid,payload) returning id into rid;
  return to_jsonb(rid);
 end if;
 if target_action in ('ignore','add') then
  select * into result from private.radar_results where id=(payload->>'id')::uuid and user_id=uid for update;
  if not found then raise exception 'result_not_found'; end if;
  if result.status='added' then return jsonb_build_object('candidateId',result.candidate_id); end if;
  if target_action='ignore' then
   update private.radar_results set status='ignored' where id=result.id;
  else
   item := result.item;
   if item->>'kind'='closed' then raise exception 'job_closed'; end if;
   -- Reuse the existing candidate entity and its normal promotion workflow.
   -- URL identity preserves requisition paths/query parameters; never merge by company alone.
   select id into cid from public.opportunity_candidates where user_id=uid and track='internship' and source_url=result.url order by created_at limit 1;
   if cid is null then
    insert into public.opportunity_candidates(user_id,track,company,role_title,location,source_url,source_summary)
     values(uid,'internship',left(coalesce(nullif(payload->>'company',''),item->>'company'),240),
      left(coalesce(nullif(payload->>'title',''),item->>'title'),240),nullif(item->>'location','未知／待核实'),result.url,
      left('手动发现，用户确认加入；开放状态、截止日期待核实。' || E'\n' || (item->>'evidence'),1000)) returning id into cid;
   end if;
   update private.radar_results set status='added',candidate_id=cid where id=result.id;
  end if;
  insert into public.audit_events(user_id,actor_type,action,object_type,object_id,outcome)
   values(uid,'user','radar.' || target_action,'radar_result',result.id::text,'succeeded');
  return jsonb_build_object('candidateId',cid);
 end if;
 select * into r from private.radar_runs where id=(payload->>'runId')::uuid and user_id=uid for update;
 if not found or r.status<>'running' or r.created_at<now()-interval '3 minutes' then raise exception 'run_not_active'; end if;
 select * into decision from private.evaluate_permission(uid,'job_radar.discovery',null);
 if not coalesce(decision.allowed,false) then raise exception 'radar_permission_denied' using errcode='42501'; end if;
 if target_action='check' then return 'true'::jsonb; end if;
 if target_action='reserve_ai' then
  if not exists(select 1 from private.evaluate_permission(uid,'job_radar.scoring',null) where allowed) then raise exception 'ai_permission_denied'; end if;
  rid := private.reserve_ai_usage_for_provider('jd_match',payload->>'fingerprint',(payload->>'reserve')::integer,payload->>'provider');
  update private.radar_runs set ai_usage_id=rid where id=r.id and ai_usage_id is null;
  if not found then raise exception 'ai_already_reserved'; end if;
  return to_jsonb(rid);
 end if;
 raise exception 'invalid_radar_action';
end; $$;
create function public.manual_radar(target_action text,payload jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select private.manual_radar(target_action,payload); $$;
revoke all on function private.manual_radar(text,jsonb),public.manual_radar(text,jsonb) from public,anon;
grant execute on function private.manual_radar(text,jsonb),public.manual_radar(text,jsonb) to authenticated;

-- Only the trusted backend can submit search evidence or settle actual AI usage.
create function public.finish_manual_radar(target_run_id uuid, target_items jsonb, target_error text, target_ai jsonb default null)
returns void language plpgsql security invoker set search_path='' as $$
declare r private.radar_runs%rowtype; item jsonb; usage public.ai_usage_events%rowtype; permitted boolean;
begin
 select * into r from private.radar_runs where id=target_run_id for update;
 if not found or r.status<>'running' then raise exception 'run_not_active'; end if;
 -- Settle known billed usage even if the user revoked permission during the call.
 if target_ai is not null and r.ai_usage_id is not null then
  select * into usage from public.ai_usage_events where id=r.ai_usage_id and user_id=r.user_id for update;
  if usage.status='reserved' and (target_ai->>'cost')::integer between 0 and usage.reserved_hkd_cents then
   update public.ai_usage_events set status='completed',model=target_ai->>'model',actual_hkd_cents=(target_ai->>'cost')::integer,
    input_tokens=(target_ai->>'inputTokens')::integer,output_tokens=(target_ai->>'outputTokens')::integer,finished_at=now() where id=usage.id;
  end if;
 end if;
 select coalesce(bool_or(allowed),false) into permitted from private.evaluate_permission(r.user_id,'job_radar.discovery',null);
 if not permitted or r.created_at<now()-interval '3 minutes' then
  update private.radar_runs set status='cancelled',error='permission_revoked_or_expired',finished_at=now() where id=r.id; return;
 end if;
 if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)>10 or pg_column_size(target_items)>131072 then raise exception 'invalid_results'; end if;
 for item in select value from jsonb_array_elements(target_items) loop
  insert into private.radar_results(user_id,run_id,url,item) values(r.user_id,r.id,item->>'url',item)
   on conflict(user_id,url) do nothing;
 end loop;
 update private.radar_runs set status=case when target_error is null then 'completed' else 'failed' end,
  error=left(target_error,120),finished_at=now(),ai_model=target_ai->>'model' where id=r.id;
 insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
  values(r.user_id,'system','radar.finished','radar_run',r.id::text,
   jsonb_build_object('results',jsonb_array_length(target_items),'searchCreditLimit',1),case when target_error is null then 'succeeded' else 'failed' end);
end; $$;
revoke all on function public.finish_manual_radar(uuid,jsonb,text,jsonb) from public,anon,authenticated;
grant execute on function public.finish_manual_radar(uuid,jsonb,text,jsonb) to service_role;
grant usage on schema private to service_role;
grant select,update on private.radar_runs to service_role;
grant select,insert on private.radar_results to service_role;
