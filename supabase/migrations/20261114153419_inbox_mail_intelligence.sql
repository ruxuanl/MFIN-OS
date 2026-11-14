-- Mail display enrichment is independent of legacy fact extraction and workflow updates.
alter table public.ai_usage_events drop constraint ai_usage_events_analysis_kind_check;
alter table public.ai_usage_events add constraint ai_usage_events_analysis_kind_check
 check (analysis_kind in ('resume','jd_match','application_pack','mail_summary'));

create table public.gmail_insights (
 message_id uuid primary key references public.gmail_messages(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 category text check (category in ('job','academic','other')),
 priority text check (priority in ('important','attention','normal')),
 summary text check (length(summary) between 1 and 40), reason text check (length(reason)<=160),
 deadline timestamptz, optional_opportunity boolean not null default false, relevant_action boolean not null default false,
 category_override text check (category_override in ('job','academic','other')),
 priority_override text check (priority_override in ('important','attention','normal')),
 status text not null default 'queued' check (status in ('queued','running','completed','failed')),
 fingerprint text, standard_version text, model text, error_code text,
 claim_token uuid, claimed_at timestamptz, usage_id uuid references public.ai_usage_events(id),
 updated_at timestamptz not null default now()
);
create index gmail_insights_owner_queue on public.gmail_insights(user_id,status,updated_at);
create index gmail_insights_usage on public.gmail_insights(usage_id);
alter table public.gmail_insights enable row level security;
revoke all on public.gmail_insights from public,anon,authenticated;
grant select on public.gmail_insights to authenticated;
grant all on public.gmail_insights to service_role;
create policy gmail_insights_owner_read on public.gmail_insights for select to authenticated
 using (user_id=(select auth.uid()));

create function private.queue_gmail_insight() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.gmail_insights(message_id,user_id) values(new.id,new.user_id) on conflict do nothing;
 return new;
end; $$;
revoke all on function private.queue_gmail_insight() from public,anon,authenticated;
create trigger queue_gmail_insight after insert on public.gmail_messages for each row execute function private.queue_gmail_insight();
insert into public.gmail_insights(message_id,user_id) select id,user_id from public.gmail_messages on conflict do nothing;

-- Small deterministic fallback: content takes precedence over sender/forwarding identity.
create function public.mail_local_category(value text) returns text language sql immutable security invoker set search_path='' as $$
 select case
 when value ~* 'scholarship|奖学金' then 'academic'
 when value ~* 'interview|recruit|career|intern|graduate programme|assessment|offer letter|job offer|job opening|面试|实习|校招|笔试|招聘|求职|录用' then 'job'
 when value ~* 'course|module|assignment|exam|lecture|tutorial|university|选课|课程|作业|考试|港大|学业' then 'academic'
 when value ~* 'application|申请' then 'job'
 else 'other' end;
$$;
create function public.mail_local_priority(value text) returns text language sql immutable security invoker set search_path='' as $$
 select case
 when value ~* 'newsletter|promotion|unsubscribe|促销|推广|订阅' then 'normal'
 when value ~* 'scholarship|career fair|career talk|webinar|job opening|奖学金|宣讲|招聘会' then 'attention'
 when value ~* 'interview invitation|invite.{0,24}interview|assessment invitation|offer letter|job offer|assignment|exam|course.{0,20}(change|cancel)|security alert|payment due|面试邀请|笔试邀请|录用|作业|考试|课程.{0,12}(变更|取消)|账户安全|到期付款' then 'important'
 when value ~* 'deadline|action required|recruit|intern|application|截止|招聘|实习|申请|请.{0,10}(完成|确认)' then 'attention'
 else 'normal' end;
$$;
create function public.mail_effective_priority(base text, optional boolean, relevant boolean, deadline timestamptz, manual text, at_time timestamptz)
returns text language sql immutable security invoker set search_path='' as $$
 select coalesce(manual,case when optional then
  case when relevant and deadline>at_time and deadline<=at_time+interval '72 hours' then 'important' else 'attention' end
 else base end);
$$;
revoke all on function public.mail_local_category(text),public.mail_local_priority(text),public.mail_effective_priority(text,boolean,boolean,timestamptz,text,timestamptz) from public,anon;
grant execute on function public.mail_local_category(text),public.mail_local_priority(text),public.mail_effective_priority(text,boolean,boolean,timestamptz,text,timestamptz) to authenticated,service_role;

create view public.inbox_mail_view with (security_invoker=true) as
 select m.id,m.user_id,m.received_at,m.sender_summary,m.subject,m.gmail_link,
 coalesce(i.category_override,i.category,public.mail_local_category(m.subject || ' ' || coalesce(m.summary,''))) as category,
 public.mail_effective_priority(coalesce(i.priority,public.mail_local_priority(m.subject || ' ' || coalesce(m.summary,''))),
  coalesce(i.optional_opportunity,false),coalesce(i.relevant_action,false),i.deadline,i.priority_override,now()) as priority,
 coalesce(i.summary,left(regexp_replace(replace(replace(m.subject,'&#39;',chr(39)),'&amp;','&'),'[[:space:]]+',' ','g'),40),'邮件') as summary,
 coalesce(i.status,'queued') as analysis_status,i.reason,i.deadline,i.category_override,i.priority_override,i.model,i.standard_version
 from public.gmail_messages m left join public.gmail_insights i on i.message_id=m.id and i.user_id=m.user_id;
revoke all on public.inbox_mail_view from public,anon,authenticated;
grant select on public.inbox_mail_view to authenticated,service_role;

create function public.read_my_mailbox(target_category text default null,target_priority text default null,target_page integer default 1)
returns jsonb language sql stable security invoker set search_path='' as $$
 with all_mail as materialized (select * from public.inbox_mail_view where user_id=auth.uid()),
 filtered as (select * from all_mail where (target_category is null or category=target_category) and (target_priority is null or priority=target_priority)),
 totals as (select category,priority,count(*) as count from all_mail group by category,priority),
 page as (select id,category,priority,summary,received_at,sender_summary from filtered order by received_at desc,id desc limit 30 offset (greatest(1,least(coalesce(target_page,1),100000))-1)*30)
 select jsonb_build_object('counts',coalesce((select jsonb_agg(to_jsonb(t)) from totals t),'[]'::jsonb),
 'queued',(select count(*) from all_mail where analysis_status='queued'),'total',(select count(*) from filtered),'unfinished',(select count(*) from all_mail where analysis_status<>'completed'),
 'messages',coalesce((select jsonb_agg(to_jsonb(p) order by p.received_at desc,p.id desc) from page p),'[]'::jsonb));
$$;
revoke all on function public.read_my_mailbox(text,text,integer) from public,anon;
grant execute on function public.read_my_mailbox(text,text,integer) to authenticated;

create function private.edit_mail_insight(target_message_id uuid,target_field text,target_value text)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if not private.m3_writes_allowed(uid) then raise exception 'privacy_locked' using errcode='42501'; end if;
 if not exists(select 1 from public.gmail_messages where id=target_message_id and user_id=uid) then raise exception 'message_not_found'; end if;
 if target_field not in ('category','priority','retry') or target_field is null then raise exception 'invalid_field'; end if;
 if target_field='category' and target_value is not null and target_value not in ('job','academic','other') then raise exception 'invalid_category'; end if;
 if target_field='priority' and target_value is not null and target_value not in ('important','attention','normal') then raise exception 'invalid_priority'; end if;
 insert into public.gmail_insights(message_id,user_id) values(target_message_id,uid) on conflict do nothing;
 if target_field='retry' then
  if not exists(select 1 from private.evaluate_permission(uid,'gmail.analysis',null) where allowed) then raise exception 'mail_permission_denied' using errcode='42501'; end if;
  update public.gmail_insights set status='queued',error_code=null,updated_at=now() where message_id=target_message_id and status<>'running';
 elsif target_field='category' then
  update public.gmail_insights set category_override=target_value,updated_at=now() where message_id=target_message_id;
 else
  update public.gmail_insights set priority_override=target_value,updated_at=now() where message_id=target_message_id;
 end if;
 insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
 values(uid,'user','mail.insight_edited','gmail_message',target_message_id::text,jsonb_build_object('field',target_field,'value',target_value),'succeeded');
end; $$;
create function public.edit_my_mail_insight(target_message_id uuid,target_field text,target_value text default null)
returns void language sql security invoker set search_path='' as $$ select private.edit_mail_insight(target_message_id,target_field,target_value); $$;
revoke all on function private.edit_mail_insight(uuid,text,text),public.edit_my_mail_insight(uuid,text,text) from public,anon;
grant execute on function private.edit_mail_insight(uuid,text,text),public.edit_my_mail_insight(uuid,text,text) to authenticated;

-- Service-only queue protocol. Every outbound read/reservation and result commit rechecks permissions.
create function public.gmail_insight_work(target_user_id uuid,target_action text,payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare uid uuid:=target_user_id; ids uuid[]; token uuid; usage public.ai_usage_events%rowtype; v_usage_id uuid;
 spent integer; month_start timestamptz:=date_trunc('month',now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
 permitted boolean; item jsonb; result jsonb;
begin
 if target_action='fail' then
  update public.gmail_insights set status='failed',error_code=case when payload->>'code' in ('ai_unavailable','mail_unavailable','permission_denied','budget_exceeded','analysis_failed') then payload->>'code' else 'analysis_failed' end,
   claim_token=null,updated_at=now() where user_id=uid and claim_token=(payload->>'token')::uuid and status='running';
  return 'true'::jsonb;
 end if;
 if target_action='finish' then
  -- Settle known usage even if permissions were revoked while the provider was running.
  select * into usage from public.ai_usage_events where id=(payload->>'usageId')::uuid and user_id=uid and analysis_kind='mail_summary' for update;
  if found and usage.status='reserved' and (payload->'usage'->>'cost')::integer between 0 and usage.reserved_hkd_cents then
   update public.ai_usage_events set status='completed',actual_hkd_cents=(payload->'usage'->>'cost')::integer,model=payload->'usage'->>'model',
    input_tokens=(payload->'usage'->>'inputTokens')::integer,output_tokens=(payload->'usage'->>'outputTokens')::integer,finished_at=now() where id=usage.id;
  elsif payload->>'usageId' is not null then raise exception 'ai_usage_unsettled'; end if;
 end if;
 select exists(select 1 from private.evaluate_permission(uid,'gmail.analysis',null) where allowed)
  and exists(select 1 from private.evaluate_permission(uid,'gmail.sync',null) where allowed) into permitted;
 if not permitted then
  if target_action='finish' then
   update public.gmail_insights set status='failed',error_code='permission_denied',claim_token=null,updated_at=now() where user_id=uid and claim_token=(payload->>'token')::uuid;
   return 'false'::jsonb;
  end if;
  raise exception 'mail_permission_denied' using errcode='42501';
 end if;
 if target_action='check' then return 'true'::jsonb; end if;
 if target_action='claim' then
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text || ':mail_analysis',0));
  update public.gmail_insights set status='failed',error_code='analysis_failed',claim_token=null,updated_at=now()
   where user_id=uid and status='running' and claimed_at<now()-interval '3 minutes';
  if exists(select 1 from public.gmail_insights where user_id=uid and status='running') then return '[]'::jsonb; end if;
  token:=gen_random_uuid();
  with chosen as (select i.message_id from public.gmail_insights i join public.gmail_messages m on m.id=i.message_id
   where i.user_id=uid and i.status='queued' order by m.received_at desc,m.id desc limit 5 for update of i skip locked),
  claimed as (update public.gmail_insights set status='running',claim_token=token,claimed_at=now(),updated_at=now() where message_id in (select message_id from chosen) returning *)
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'providerId',m.provider_message_id,'token',token,'fingerprint',i.fingerprint,'hasResult',i.summary is not null)), '[]'::jsonb)
   into result from claimed i join public.gmail_messages m on m.id=i.message_id;
  return result;
 end if;
 if target_action='reserve' then
  token:=(payload->>'token')::uuid;
  if not exists(select 1 from public.gmail_insights where user_id=uid and status='running' and claim_token=token and claimed_at>now()-interval '3 minutes') then raise exception 'mail_claim_expired'; end if;
  if payload->>'fingerprint' !~ '^[0-9a-f]{64}$' or (payload->>'reserve')::integer not between 1 and 10000 or payload->>'provider'<>'deepseek' then raise exception 'invalid_reservation'; end if;
  if exists(select 1 from public.gmail_insights where user_id=uid and claim_token=token and usage_id is not null and claimed_at<=updated_at and usage_id in (select id from public.ai_usage_events where status='reserved' and created_at>=claimed_at)) then raise exception 'already_reserved'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(uid::text || ':ai_budget',0));
  select coalesce(sum(case when status='completed' then actual_hkd_cents else reserved_hkd_cents end),0)::integer into spent
   from public.ai_usage_events where user_id=uid and created_at>=month_start and status in ('reserved','completed');
  if spent+(payload->>'reserve')::integer>10000 then raise exception 'ai_monthly_budget_exceeded'; end if;
  insert into public.ai_usage_events(user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,provider)
   values(uid,'mail_summary',payload->>'fingerprint',(payload->>'reserve')::integer,'deepseek') returning id into v_usage_id;
  update public.gmail_insights i set usage_id=v_usage_id where i.user_id=uid and i.claim_token=token;
  return to_jsonb(v_usage_id);
 end if;
 if target_action in ('cached','finish') then
  token:=(payload->>'token')::uuid;
  for item in select value from jsonb_array_elements(payload->'results') loop
   result:=item->'result';
   if target_action='cached' then
    update public.gmail_insights set status='completed',claim_token=null,error_code=null,updated_at=now()
     where message_id=(item->>'id')::uuid and user_id=uid and claim_token=token and fingerprint=item->>'fingerprint' and summary is not null;
   else
    if result->>'category' not in ('job','academic','other') or result->>'priority' not in ('important','attention','normal')
      or length(result->>'summary') not between 1 and 40 or length(result->>'reason') not between 1 and 160 then raise exception 'invalid_mail_result'; end if;
    update public.gmail_insights set category=result->>'category',priority=result->>'priority',summary=result->>'summary',reason=result->>'reason',
     deadline=(result->>'deadline')::timestamptz,optional_opportunity=(result->>'optionalOpportunity')::boolean,relevant_action=(result->>'relevantAction')::boolean,
     fingerprint=item->>'fingerprint',standard_version=payload->>'standardVersion',model=payload->'usage'->>'model',status='completed',error_code=null,claim_token=null,updated_at=now()
     where message_id=(item->>'id')::uuid and user_id=uid and claim_token=token and status='running' and claimed_at>now()-interval '3 minutes' and usage_id=(payload->>'usageId')::uuid;
   end if;
  end loop;
  if target_action='finish' then
   insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
    values(uid,'system','mail.analysis_completed','ai_usage',payload->>'usageId',jsonb_build_object('standard',payload->>'standardVersion','count',jsonb_array_length(payload->'results')),'succeeded');
  end if;
  return 'true'::jsonb;
 end if;
 raise exception 'invalid_mail_action';
end; $$;
revoke all on function public.gmail_insight_work(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.gmail_insight_work(uuid,text,jsonb) to service_role;

-- Opt-in deployment origin: never send Test/local work to an existing deployment accidentally.
create function private.invoke_mail_analysis_cron() returns bigint language plpgsql security definer set search_path='' as $$
declare origin text; uid uuid; permission record; rid uuid; request_id bigint;
begin
 select decrypted_secret into origin from vault.decrypted_secrets where name='mail_analysis_app_origin' order by created_at desc limit 1;
 if origin is null or origin !~ '^https://[A-Za-z0-9.-]+$' then return null; end if;
 select user_id into uid from public.gmail_insights where status='queued' order by updated_at limit 1;
 if uid is null then return null; end if;
 select * into permission from private.evaluate_permission(uid,'gmail.analysis',null);
 if not coalesce(permission.allowed,false) then return null; end if;
 insert into public.automation_runs(user_id,capability_key,permission_grant_id,idempotency_key,status,progress,safe_checkpoint,permission_snapshot,input_reference)
 values(uid,'gmail.analysis',permission.grant_id,'mail-analysis:' || to_char(date_trunc('minute',now()),'YYYYMMDDHH24MI'),'queued',0,'cron_dispatched',jsonb_build_object('allowed',true),'{}'::jsonb)
 on conflict(user_id,idempotency_key) do nothing returning id into rid;
 if rid is null then return null; end if;
 select net.http_post(url:=origin || '/api/internal/mail-analysis',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('runId',rid),timeout_milliseconds:=1000) into request_id;
 return request_id;
end; $$;
revoke all on function private.invoke_mail_analysis_cron() from public,anon,authenticated;
grant execute on function private.invoke_mail_analysis_cron() to service_role;
select cron.schedule('mail-analysis-1m','* * * * *',$cron$select private.invoke_mail_analysis_cron();$cron$);
