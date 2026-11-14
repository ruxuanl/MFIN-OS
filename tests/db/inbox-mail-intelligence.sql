-- Synthetic-only transaction: no provider requests, real account mutations or retained data.
begin;
insert into auth.users(id,email) values('77777777-7777-4777-8777-777777777701','mail-test@example.invalid'),('77777777-7777-4777-8777-777777777702','mail-other@example.invalid');
select set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777701","role":"authenticated"}',true);
insert into public.external_connections(user_id,provider,status) values(auth.uid(),'gmail','connected');
insert into public.permission_grants(user_id,capability_key,mode,active)
 select auth.uid(),capability_key,'persistent',true from public.capability_definitions
 where capability_key in ('gmail.analysis','gmail.sync','gmail.connection','ai.master','ai.analysis')
 on conflict(user_id,capability_key) do update set mode='persistent',active=true,starts_at=now(),expires_at=null,operation_id=null;
insert into public.gmail_messages(user_id,provider_message_id,provider_thread_id,history_id,received_at,classification,sender_summary,subject,summary,gmail_link,confidence)
 select auth.uid(),'synthetic-mail-'||n,'synthetic-thread-'||n,'1',now()-n*interval '1 minute','academic','Synthetic University <school@example.invalid>',
 case when n<=45 then 'HKU career: internship recruitment' when n<=90 then 'Scholarship application' else 'Newsletter' end,
 'Synthetic content only','https://mail.google.com/mail/u/0/#all/synthetic-'||n,0.8 from generate_series(1,131) n;
set local role authenticated;
do $$ declare result jsonb; other jsonb; mid uuid; begin
 if has_table_privilege('authenticated','public.gmail_insights','insert,update,delete') or has_function_privilege('authenticated','public.gmail_insight_work(uuid,text,jsonb)','execute')
  or has_function_privilege('anon','public.read_my_mailbox(text,text,integer)','execute') then raise exception 'unsafe_grants'; end if;
 result:=public.read_my_mailbox();
 if (result->>'total')::integer<>131 then raise exception 'truncated_total'; end if;
 if (select sum((value->>'count')::integer) from jsonb_array_elements(result->'counts'))<>131 then raise exception 'incorrect_counts'; end if;
 result:=public.read_my_mailbox('job'); other:=public.read_my_mailbox('job',null,2);
 if (result->>'total')::integer<>45 or jsonb_array_length(result->'messages')<>30 or jsonb_array_length(other->'messages')<>15 then raise exception 'pagination_wrong'; end if;
 if exists(select 1 from jsonb_array_elements(result->'messages') a join jsonb_array_elements(other->'messages') b on a->>'id'=b->>'id') then raise exception 'duplicate_page'; end if;
 if (public.read_my_mailbox('academic')->>'total')::integer<>45 then raise exception 'scholarship_category_wrong'; end if;
 select id into mid from public.gmail_messages where provider_message_id='synthetic-mail-1' and user_id=auth.uid();
 perform set_config('mail.test_id',mid::text,true);
 perform public.edit_my_mail_insight(mid,'category','other');
 perform public.edit_my_mail_insight(mid,'priority','normal');
 if not exists(select 1 from public.inbox_mail_view where id=mid and category='other' and priority='normal') then raise exception 'manual_override_failed'; end if;
 perform set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777702","role":"authenticated"}',true);
 if exists(select 1 from public.gmail_insights) or (public.read_my_mailbox()->>'total')::integer<>0 then raise exception 'owner_leak'; end if;
 begin perform public.edit_my_mail_insight(mid,'priority','important'); raise exception 'cross_owner_edit'; exception when raise_exception then if sqlerrm<>'message_not_found' then raise; end if; end;
 perform set_config('request.jwt.claims','{"sub":"77777777-7777-4777-8777-777777777701","role":"authenticated"}',true);
 perform public.edit_my_mail_insight(mid,'category',null); perform public.edit_my_mail_insight(mid,'priority',null);
end $$;
reset role;
set local role service_role;
do $$ declare claimed jsonb; token text; usage_id jsonb; result jsonb; ids jsonb; begin
 claimed:=public.gmail_insight_work(auth.uid(),'claim'); token:=claimed->0->>'token';
 if jsonb_array_length(claimed)<>5 or token is null then raise exception 'claim_failed'; end if;
 if public.gmail_insight_work(auth.uid(),'claim')<>'[]'::jsonb then raise exception 'concurrent_claim_not_blocked'; end if;
 perform set_config('mail.test_token',token,true);
 usage_id:=public.gmail_insight_work(auth.uid(),'reserve',jsonb_build_object('token',token,'fingerprint',repeat('a',64),'reserve',200,'provider','deepseek'));
 perform set_config('mail.test_usage',usage_id#>>'{}',true);
 begin perform public.gmail_insight_work(auth.uid(),'reserve',jsonb_build_object('token',token,'fingerprint',repeat('a',64),'reserve',200,'provider','deepseek')); raise exception 'duplicate_reservation'; exception when raise_exception then if sqlerrm<>'already_reserved' then raise; end if; end;
 select jsonb_agg(jsonb_build_object('id',value->>'id','fingerprint',repeat('b',64),'result',jsonb_build_object('category','job','priority','attention','summary','合成招聘机会，请确认截止时间','reason','合成的可选机会','deadline',now()+interval '72 hours','optionalOpportunity',true,'relevantAction',true))) into ids from jsonb_array_elements(claimed);
 perform set_config('mail.test_results',ids::text,true);
 result:=public.gmail_insight_work(auth.uid(),'finish',jsonb_build_object('token',token,'usageId',usage_id,'usage',jsonb_build_object('cost',1,'model','deepseek-flash','inputTokens',100,'outputTokens',50),'standardVersion','mail_insight_v1','results',ids));
 if result<>'true'::jsonb then raise exception 'finish_failed'; end if;
 if (select count(*) from public.inbox_mail_view where user_id=auth.uid() and analysis_status='completed' and priority='important')<>5 then raise exception 'time_upgrade_wrong'; end if;
end $$;
reset role;
set local role authenticated;
select public.edit_my_mail_insight(current_setting('mail.test_id')::uuid,'priority','normal');
reset role;
update public.gmail_insights set deadline=now()-interval '1 second' where user_id=auth.uid() and status='completed';
do $$ begin
 if (select count(*) from public.inbox_mail_view where user_id=auth.uid() and analysis_status='completed' and priority='attention')<>4 then raise exception 'expiry_or_lock_wrong'; end if;
 if public.mail_effective_priority('attention',true,true,now()+interval '72 hours',null,now())<>'important'
  or public.mail_effective_priority('attention',true,true,now()+interval '72 hours 1 second',null,now())<>'attention'
  or public.mail_effective_priority('important',false,true,now()-interval '1 day',null,now())<>'important' then raise exception 'time_boundary_wrong'; end if;
end $$;
-- Atomic shared budget with other AI kinds.
insert into public.ai_usage_events(user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,status,actual_hkd_cents,provider)
 values(auth.uid(),'resume',repeat('c',64),9999,'completed',9999,'deepseek');
set local role service_role;
do $$ declare claimed jsonb; begin
 claimed:=public.gmail_insight_work(auth.uid(),'claim');
 begin perform public.gmail_insight_work(auth.uid(),'reserve',jsonb_build_object('token',claimed->0->>'token','fingerprint',repeat('d',64),'reserve',200,'provider','deepseek')); raise exception 'budget_not_enforced'; exception when raise_exception then if sqlerrm<>'ai_monthly_budget_exceeded' then raise; end if; end;
 perform public.gmail_insight_work(auth.uid(),'fail',jsonb_build_object('token',claimed->0->>'token','code','budget_exceeded'));
end $$;
reset role;
update public.permission_grants set active=false where user_id=auth.uid() and capability_key='gmail.analysis';
set local role service_role;
do $$ begin
 begin perform public.gmail_insight_work(auth.uid(),'claim'); raise exception 'permission_not_enforced'; exception when insufficient_privilege then null; end;
end $$;
reset role;

update public.permission_grants set active=true where user_id=auth.uid() and capability_key='gmail.analysis';
insert into public.privacy_locks(user_id,is_locked,locked_at) values(auth.uid(),true,now()) on conflict(user_id) do update set is_locked=true,locked_at=now();
set local role authenticated;
do $$ begin
 begin perform public.edit_my_mail_insight(current_setting('mail.test_id')::uuid,'priority','important'); raise exception 'lock_not_enforced'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role service_role;
do $$ begin
 begin perform public.gmail_insight_work(auth.uid(),'claim'); raise exception 'worker_lock_not_enforced'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
