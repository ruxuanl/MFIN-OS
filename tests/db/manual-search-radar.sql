-- Owner's isolated Test only. Synthetic evidence; every write rolls back.
begin;
do $$ begin
 if (select count(*) from auth.users)<>1 then raise exception 'single_user_test_required'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users limit 1),'role','authenticated')::text,true);
end $$;
insert into public.permission_grants(user_id,capability_key,mode,active)
select auth.uid(),capability_key,'persistent',true from public.capability_definitions where capability_key in ('job_radar.discovery','job_radar.enabled')
on conflict(user_id,capability_key) do update set mode='persistent',active=true,operation_id=null,expires_at=null,starts_at=now();
-- Grant the actual registered discovery dependencies in this rollback transaction only.
insert into public.permission_grants(user_id,capability_key,mode,active)
select auth.uid(),required_capability_key,'persistent',true from public.capability_dependencies where capability_key='job_radar.discovery'
on conflict(user_id,capability_key) do update set mode='persistent',active=true,operation_id=null,expires_at=null,starts_at=now();
set local role authenticated;
do $$ declare rid uuid; claims text:=current_setting('request.jwt.claims'); begin
 if has_function_privilege('anon','public.manual_radar(text,jsonb)','execute') or has_function_privilege('authenticated','public.finish_manual_radar(uuid,jsonb,text,jsonb)','execute') then raise exception 'unsafe_rpc_grants'; end if;
 rid := (public.manual_radar('start','{"direction":"research","region":"Hong Kong","internshipType":"internship","profile":"Synthetic profile"}')#>>'{}')::uuid;
 perform set_config('radar.test_run',rid::text,true);
 begin perform public.manual_radar('start','{"direction":"research","region":"Hong Kong","internshipType":"internship","profile":"Synthetic profile"}'); raise exception 'cooldown_not_enforced';
 exception when raise_exception then if sqlerrm<>'radar_busy' then raise; end if; end;
 perform set_config('request.jwt.claims','{}',true);
 begin perform public.manual_radar('read'); raise exception 'authentication_not_enforced'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub','00000000-0000-4000-8000-000000000002','role','authenticated')::text,true);
 if jsonb_array_length(public.manual_radar('read')->'runs')<>0 then raise exception 'cross_owner_read'; end if;
 perform set_config('request.jwt.claims',claims,true);
end $$;
reset role;
set local role service_role;
select public.finish_manual_radar(current_setting('radar.test_run')::uuid,
 '[{"url":"https://synthetic.example.invalid/job/48a","title":"Synthetic Research Intern","company":"Synthetic Capital","location":"Hong Kong","kind":"job","evidence":"Synthetic evidence"},{"url":"https://synthetic.example.invalid/job/48b","title":"Synthetic Banking Intern","company":"Synthetic Capital","location":"Hong Kong","kind":"job","evidence":"Synthetic evidence"}]',null);
reset role;
set local role authenticated;
do $$ declare items jsonb; cid1 uuid; cid2 uuid; rid uuid; begin
 items := public.manual_radar('read')->'items';
 select (value->>'id')::uuid into rid from jsonb_array_elements(items) where value->>'url'='https://synthetic.example.invalid/job/48a';
 cid1 := (public.manual_radar('add',jsonb_build_object('id',rid))->>'candidateId')::uuid;
 cid2 := (public.manual_radar('add',jsonb_build_object('id',rid))->>'candidateId')::uuid;
 if cid1 is null or cid1<>cid2 then raise exception 'add_not_idempotent'; end if;
 if (select count(*) from public.opportunity_candidates where source_url='https://synthetic.example.invalid/job/48a')<>1 then raise exception 'candidate_missing_or_duplicate'; end if;
 select (value->>'id')::uuid into rid from jsonb_array_elements(items) where value->>'url'='https://synthetic.example.invalid/job/48b';
 perform public.manual_radar('ignore',jsonb_build_object('id',rid));
 if exists(select 1 from public.opportunity_candidates where source_url='https://synthetic.example.invalid/job/48b') then raise exception 'ignore_created_candidate'; end if;
end $$;
reset role;
insert into public.privacy_locks(user_id,is_locked,locked_at) values(auth.uid(),true,now())
on conflict(user_id) do update set is_locked=true,locked_at=now();
set local role authenticated;
do $$ begin
 begin perform public.manual_radar('ignore',jsonb_build_object('id',gen_random_uuid())); raise exception 'lock_not_enforced'; exception when insufficient_privilege then if sqlerrm<>'privacy_locked' then raise; end if; end;
end $$;
reset role;
-- Restore within this rollback-only test with a synthetic fresh-auth claim.
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb || jsonb_build_object('amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from now())+1))))::text,true);
update public.privacy_locks set is_locked=false where user_id=auth.uid();
update public.permission_grants set active=false where user_id=auth.uid() and capability_key='job_radar.discovery';
set local role authenticated;
do $$ begin
 begin perform public.manual_radar('start','{"direction":"research","region":"HK","internshipType":"internship","profile":"Synthetic"}'); raise exception 'permission_not_enforced'; exception when insufficient_privilege then null; end;
end $$;
rollback;
