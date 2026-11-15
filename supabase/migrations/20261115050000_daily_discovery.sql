-- Daily briefing is separate from manual radar. No automatic promotion or mail writes.
create table private.daily_discovery_settings (
 user_id uuid primary key references auth.users(id) on delete cascade,
 enabled boolean not null default false,
 profile text not null check(length(profile) between 1 and 600),
 revision integer not null default 1,
 updated_at timestamptz not null default now()
);
create table private.daily_discovery_reports (
 user_id uuid not null references auth.users(id) on delete cascade,
 report_day date not null, run_id uuid references private.radar_runs(id) on delete set null,
 revision integer not null, status text not null check(status in ('running','completed','failed','cancelled')),
 recommendations jsonb not null default '[]', error_code text,
 created_at timestamptz not null default now(), finished_at timestamptz,
 primary key(user_id,report_day)
);
alter table private.daily_discovery_settings enable row level security;
alter table private.daily_discovery_reports enable row level security;
revoke all on private.daily_discovery_settings,private.daily_discovery_reports from public,anon,authenticated;

create function private.daily_discovery(target_action text,payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'authentication_required'; end if;
 if target_action='read' then
  return jsonb_build_object('settings',(select to_jsonb(s) from private.daily_discovery_settings s where user_id=uid),
   'reports',coalesce((select jsonb_agg(to_jsonb(r) order by report_day desc) from
   (select * from private.daily_discovery_reports where user_id=uid order by report_day desc limit 7) r),'[]'::jsonb));
 end if;
 if not private.m3_writes_allowed(uid) then raise exception 'privacy_locked'; end if;
 if target_action='save' then
  if length(trim(payload->>'profile')) not between 1 and 600 or payload->>'profile' is null then raise exception 'invalid_profile'; end if;
  insert into private.daily_discovery_settings(user_id,enabled,profile) values(uid,(payload->>'enabled')::boolean,trim(payload->>'profile'))
  on conflict(user_id) do update set enabled=excluded.enabled,profile=excluded.profile,revision=private.daily_discovery_settings.revision+1,updated_at=now();
  insert into public.audit_events(user_id,actor_type,action,object_type,object_id,outcome)
   values(uid,'user','daily_discovery.settings','daily_discovery',uid::text,'succeeded');
  return 'true';
 end if;
 raise exception 'invalid_action';
end $$;
create function public.daily_discovery(target_action text,payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select private.daily_discovery(target_action,payload)$$;
revoke all on function private.daily_discovery(text,jsonb),public.daily_discovery(text,jsonb) from public,anon;
grant execute on function private.daily_discovery(text,jsonb),public.daily_discovery(text,jsonb) to authenticated;

-- Service-only bridge: identity is transaction local and restored on every return.
create function public.daily_discovery_work(target_user_id uuid,target_action text,payload jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare s private.daily_discovery_settings%rowtype; r private.daily_discovery_reports%rowtype;
 day date:=(now() at time zone 'Asia/Shanghai')::date; rid jsonb; result jsonb;
 prior_sub text:=current_setting('request.jwt.claim.sub',true); prior_claims text:=current_setting('request.jwt.claims',true);
begin
 perform pg_advisory_xact_lock(hashtextextended(target_user_id::text||':daily_discovery',0));
 select * into s from private.daily_discovery_settings where user_id=target_user_id;
 if target_action='claim' and (s.user_id is null or not s.enabled or (now() at time zone 'Asia/Shanghai')::time < time '09:00') then return null; end if;
 perform set_config('request.jwt.claim.sub',target_user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',target_user_id,'role','authenticated')::text,true);
 if target_action='claim' then
  -- Once per local day, including failures: never repeat a possibly billed request.
  if exists(select 1 from private.daily_discovery_reports where user_id=target_user_id and report_day=day) then
   update private.daily_discovery_reports set status='failed',error_code='worker_interrupted',finished_at=now()
    where user_id=target_user_id and report_day=day and status='running' and created_at<now()-interval '5 minutes';
   result:=null;
  else
   select preferences into result from private.radar_runs where user_id=target_user_id order by created_at desc limit 1;
   result:=coalesce(result,jsonb_build_object('direction','二级买方,二级卖方,投行','region','香港','internshipType','日常,暑期','keywords','','publishedWithin','7','profile','每日发现'));
   result:=result||jsonb_build_object('source','all','publishedWithin','7');
   rid:=private.manual_radar('start',result);
   insert into private.daily_discovery_reports(user_id,report_day,run_id,revision,status) values(target_user_id,day,(rid#>>'{}')::uuid,s.revision,'running');
   result:=jsonb_build_object('runId',rid,'preferences',result,'profile',s.profile,'day',day);
  end if;
 else
  select * into r from private.daily_discovery_reports where user_id=target_user_id and run_id=(payload->>'runId')::uuid for update;
  if r.user_id is null or r.status<>'running' then raise exception 'daily_run_not_active'; end if;
  if target_action in ('check','reserve_ai') then
   if not s.enabled or s.revision<>r.revision then raise exception 'daily_settings_changed'; end if;
   result:=private.manual_radar(target_action,payload);
  elsif target_action='finish' then
   update private.daily_discovery_reports set
    status=case when not s.enabled or s.revision<>r.revision or not private.m3_writes_allowed(target_user_id)
      or not exists(select 1 from private.evaluate_permission(target_user_id,'job_radar.discovery',null) where allowed)
      or not exists(select 1 from private.radar_runs where id=r.run_id and status='completed') then 'cancelled'
      when payload->>'error' is not null then 'failed' else 'completed' end,
    error_code=left(payload->>'error',100),finished_at=now(),recommendations=coalesce(payload->'recommendations','[]')
    where user_id=target_user_id and run_id=r.run_id;
   -- Suppress recommendations if permission/settings changed during execution.
   update private.daily_discovery_reports set recommendations='[]' where user_id=target_user_id and run_id=r.run_id and status<>'completed';
   result:='true';
  else raise exception 'invalid_action'; end if;
 end if;
 perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
 return result;
end $$;
revoke all on function public.daily_discovery_work(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.daily_discovery_work(uuid,text,jsonb) to service_role;
