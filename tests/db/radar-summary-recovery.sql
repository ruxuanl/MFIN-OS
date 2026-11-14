begin;
do $$ begin
 if (select count(*) from auth.users)<>1 then raise exception 'single_user_test_required'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',(select id from auth.users limit 1),'role','authenticated')::text,true);
end $$;
do $$ declare rid uuid; base jsonb; enriched jsonb; v jsonb; sid uuid; begin
 if has_function_privilege('authenticated','public.finish_manual_radar(uuid,jsonb,text,jsonb)','execute')
 or has_function_privilege('anon','public.finish_manual_radar(uuid,jsonb,text,jsonb)','execute') then raise exception 'unsafe_rpc'; end if;
 base := '{"url":"https://synthetic.example.invalid/jobs/summary-recovery","title":"Original title","company":"Original company","location":"Hong Kong","evidence":"Original source evidence","kind":"job"}';
 enriched := base || '{"summary":"中文岗位摘要","jdSummary":"中文职责","category":"二级买方","locationZh":"香港","isRecruiting":true,"warning":"待核实","reason":"来源证据","title":"Must not overwrite","company":"Must not overwrite"}';
 insert into private.radar_runs(user_id,preferences) values(auth.uid(),'{}') returning id into rid;
 perform set_config('radar.summary_test_run',rid::text,true);
 insert into private.radar_results(user_id,run_id,url,item,status) values(auth.uid(),rid,base->>'url',base,'ignored') returning id into sid;
 perform set_config('radar.summary_test_id',sid::text,true);
 perform set_config('radar.summary_test_input',jsonb_build_array(enriched)::text,true);
end $$;
set local role service_role;
select public.finish_manual_radar(current_setting('radar.summary_test_run')::uuid,current_setting('radar.summary_test_input')::jsonb,null,'{"model":"synthetic"}');
reset role;
do $$ declare saved private.radar_results%rowtype; rid uuid; begin
 select * into saved from private.radar_results where id=current_setting('radar.summary_test_id')::uuid;
 if saved.item->>'summary'<>'中文岗位摘要' or saved.item->>'title'<>'Original title' or saved.item->>'company'<>'Original company' or saved.item->>'evidence'<>'Original source evidence' or saved.status<>'ignored' then raise exception 'original_overwritten_or_summary_missing'; end if;
 insert into private.radar_runs(user_id,preferences) values(auth.uid(),'{}') returning id into rid;
 perform set_config('radar.summary_test_run',rid::text,true);
 perform set_config('radar.summary_test_input',jsonb_build_array(saved.item || '{"summary":"Must not replace","evidence":"Different source"}')::text,true);
end $$;
set local role service_role;
select public.finish_manual_radar(current_setting('radar.summary_test_run')::uuid,current_setting('radar.summary_test_input')::jsonb,null,'{"model":"synthetic"}');
reset role;
do $$ begin
 if (select item->>'summary' from private.radar_results where id=current_setting('radar.summary_test_id')::uuid)<>'中文岗位摘要' then raise exception 'summary_replaced'; end if;
end $$;
rollback;
