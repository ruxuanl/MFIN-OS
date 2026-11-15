-- Single-user isolated Test; synthetic settings and reports all roll back.
begin;
do $$ begin
 if (select count(*) from auth.users)<>1 then raise exception 'single_user_test_required'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users limit 1),'role','authenticated')::text,true);
 perform set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
end $$;
insert into private.daily_discovery_settings(user_id,enabled,profile) values(auth.uid(),true,'Synthetic profile')
on conflict(user_id) do update set enabled=true,profile='Synthetic profile';
delete from private.daily_discovery_reports where user_id=auth.uid() and report_day=(now() at time zone 'Asia/Shanghai')::date;
-- Avoid collisions with real cooldowns within this rolled-back transaction only.
update private.radar_runs set created_at=now()-interval '1 day',status='completed' where user_id=auth.uid() and created_at>now()-interval '3 minutes';
set local role service_role;
do $$ declare a jsonb;b jsonb; begin
 a:=public.daily_discovery_work(auth.uid(),'claim');
 if a is null then raise exception 'claim_failed'; end if;
 if a->'preferences'->>'direction'<>'二级买方,二级卖方,PEVC' then raise exception 'wrong_directions'; end if;
 perform set_config('daily.test_run',a->>'runId',true);
 b:=public.daily_discovery_work(auth.uid(),'claim');
 if b is not null then raise exception 'duplicate_claim'; end if;
 if current_setting('request.jwt.claim.sub')<>auth.uid()::text then raise exception 'claims_not_restored'; end if;
 perform public.daily_discovery_work(auth.uid(),'check',jsonb_build_object('runId',a->>'runId'));
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.daily_discovery_work(uuid,text,jsonb)','execute')
 or has_function_privilege('anon','public.daily_discovery(text,jsonb)','execute') then raise exception 'unsafe_grants'; end if;
end $$;
set local role authenticated;
select public.daily_discovery('save','{"enabled":false,"profile":"Synthetic paused profile"}');
reset role;
set local role service_role;
do $$ begin
 begin
  perform public.daily_discovery_work(auth.uid(),'check',jsonb_build_object('runId',current_setting('daily.test_run')));
  raise exception 'pause_not_enforced';
 exception when raise_exception then if sqlerrm<>'daily_settings_changed' then raise; end if; end;
end $$;
select public.finish_manual_radar(current_setting('daily.test_run')::uuid,'[]',null);
select public.daily_discovery_work(auth.uid(),'finish',jsonb_build_object('runId',current_setting('daily.test_run'),'recommendations','[]'::jsonb));
reset role;
do $$ begin
 if not exists(select 1 from private.daily_discovery_reports where run_id=current_setting('daily.test_run')::uuid and status='cancelled' and recommendations='[]') then raise exception 'cancelled_report_leaked'; end if;
 perform set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
 perform set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
 if jsonb_array_length(public.daily_discovery('read')->'reports')<>0 then raise exception 'cross_owner_read'; end if;
end $$;
rollback;
