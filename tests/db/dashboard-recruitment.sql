-- Disposable PostgreSQL / isolated Test only. Synthetic fixtures, rollback.
begin;
insert into auth.users(id,email) values ('88888888-8888-4888-8888-888888888801','dashboard-test@example.invalid'),('88888888-8888-4888-8888-888888888802','dashboard-other@example.invalid');
select set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888801","role":"authenticated"}',true);
insert into public.external_connections(user_id,provider,status) values(auth.uid(),'gmail','connected');
insert into public.permission_grants(user_id,capability_key,mode,active)
select auth.uid(),capability_key,'persistent',true from public.capability_definitions where capability_key in ('gmail.connection','gmail.sync','gmail.rules_extract','gmail.rules_status_update')
on conflict(user_id,capability_key) do update set mode='persistent',active=true,starts_at=now(),expires_at=null;
insert into public.opportunities(id,user_id,track,company,role_title,main_stage,applied_at)
values('88888888-8888-4888-8888-888888888810',auth.uid(),'internship','Synthetic Asset Management','Analyst','submitted',now());
insert into public.evidence_refs(id,user_id,source_type,summary) values('88888888-8888-4888-8888-888888888820',auth.uid(),'gmail','Synthetic stage notice');
insert into public.gmail_messages(id,user_id,provider_message_id,provider_thread_id,history_id,received_at,classification,subject,gmail_link,confidence,evidence_id)
select ('88888888-8888-4888-8888-' || (888888888830+n)::text)::uuid,auth.uid(),'synthetic-dashboard-'||n,'synthetic-thread-'||n,'1',now(),'job','Synthetic notice','https://mail.google.com/',0.99,'88888888-8888-4888-8888-888888888820' from generate_series(1,6) n;
insert into public.inbox_items(id,user_id,gmail_message_id,item_type,classification,title,summary,confidence,target_type,target_id,evidence_id)
select ('88888888-8888-4888-8888-' || (888888888840+n)::text)::uuid,auth.uid(),id,'email_update','job','Synthetic stage notice','Synthetic excerpt',0.99,'opportunity','88888888-8888-4888-8888-888888888810',evidence_id from public.gmail_messages join generate_series(1,6) n on provider_message_id='synthetic-dashboard-'||n where user_id=auth.uid();

do $$ declare u uuid; first_update uuid; begin
 if has_function_privilege('authenticated','public.apply_gmail_recruitment_update(uuid,uuid,uuid,text)','execute') or has_function_privilege('anon','public.apply_gmail_recruitment_update(uuid,uuid,uuid,text)','execute') then raise exception 'unsafe_rpc_grants'; end if;
 first_update:=public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888841','88888888-8888-4888-8888-888888888810','read_confirmed');
 if first_update is null or not exists(select 1 from public.opportunities where id='88888888-8888-4888-8888-888888888810' and main_stage='submitted' and substage='Read Confirmed') then raise exception 'read_not_stage'; end if;
 if public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888841','88888888-8888-4888-8888-888888888810','read_confirmed')<>first_update then raise exception 'retry_not_idempotent'; end if;
 perform public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888842','88888888-8888-4888-8888-888888888810','read_confirmed');
 if (select count(*) from public.gmail_updates where opportunity_id='88888888-8888-4888-8888-888888888810')<>1 then raise exception 'repeated_read_duplicated'; end if;
 -- Jump directly to interview: no assessment event is invented.
 u:=public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888843','88888888-8888-4888-8888-888888888810','interview');
 if u is null or exists(select 1 from public.timeline_entries where entity_id='88888888-8888-4888-8888-888888888810' and changes->>'to_stage'='test') then raise exception 'skip_stage_wrong'; end if;
 begin perform public.undo_my_gmail_update(first_update); raise exception 'stale_undo_allowed'; exception when serialization_failure then null; end;
 insert into public.field_locks(user_id,object_type,object_id,field_path,reason) values(auth.uid(),'opportunity','88888888-8888-4888-8888-888888888810','main_stage','user_manual_edit');
 if public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888844','88888888-8888-4888-8888-888888888810','offer') is not null then raise exception 'manual_lock_overwritten'; end if;
 update public.permission_grants set active=false where user_id=auth.uid() and capability_key='gmail.rules_status_update';
 begin perform public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888844','88888888-8888-4888-8888-888888888810','offer'); raise exception 'permission_ignored'; exception when insufficient_privilege then null; end;
 update public.permission_grants set active=true where user_id=auth.uid() and capability_key='gmail.rules_status_update';
 insert into public.privacy_locks(user_id,is_locked,locked_at) values(auth.uid(),true,now()) on conflict(user_id) do update set is_locked=true,locked_at=now();
 begin perform public.apply_gmail_recruitment_update(auth.uid(),'88888888-8888-4888-8888-888888888844','88888888-8888-4888-8888-888888888810','offer'); raise exception 'privacy_ignored'; exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','authenticated','amr',jsonb_build_array(jsonb_build_object('method','password','timestamp',extract(epoch from clock_timestamp())+1)))::text,true);
 update public.privacy_locks set is_locked=false,locked_at=null where user_id=auth.uid();
 begin perform public.apply_gmail_recruitment_update('88888888-8888-4888-8888-888888888802','88888888-8888-4888-8888-888888888844','88888888-8888-4888-8888-888888888810','offer'); raise exception 'cross_owner_allowed'; exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select public.undo_my_gmail_update(id) from public.gmail_updates where user_id=auth.uid() and update_type='interview_invitation';
do $$ begin
 if not exists(select 1 from public.opportunities where id='88888888-8888-4888-8888-888888888810' and main_stage='submitted' and substage='Read Confirmed') then raise exception 'undo_did_not_restore_stage'; end if;
end $$;
reset role;
update public.gmail_messages set needs_action=true,action_title='Synthetic invitation reply' where id='88888888-8888-4888-8888-888888888835';
insert into public.inbox_items(id,user_id,gmail_message_id,item_type,classification,title,summary,confidence,evidence_id)
values('88888888-8888-4888-8888-888888888850',auth.uid(),'88888888-8888-4888-8888-888888888835','email_action','job','Synthetic task','Synthetic excerpt',0.99,'88888888-8888-4888-8888-888888888820');
set local role authenticated;
do $$ declare saved_action uuid; result jsonb; begin
 if has_table_privilege('authenticated','public.inbox_items','insert,update,delete') or has_table_privilege('authenticated','public.gmail_updates','insert,update,delete') then raise exception 'gmail_tables_writable'; end if;
 if public.resolve_my_inbox_item('88888888-8888-4888-8888-888888888845','accept') is null then raise exception 'recruitment_invitation_task_not_extracted'; end if;
 saved_action:=public.resolve_my_inbox_item('88888888-8888-4888-8888-888888888850','accept');
 if saved_action is null or not exists(select 1 from public.inbox_items where id='88888888-8888-4888-8888-888888888850' and status='accepted' and inbox_items.action_id=saved_action) then raise exception 'extraction_not_saved'; end if;
 result:=public.apply_workspace_mutation(gen_random_uuid(),'dashboard-synthetic','action',saved_action,1,'{"status":"unscheduled"}','{"status":"completed"}');
 if (result->>'conflictCount')::integer<>0 or not exists(select 1 from public.actions where id=saved_action and status='completed' and completed_at is not null) then raise exception 'independent_progress_not_saved'; end if;
 perform set_config('request.jwt.claims','{"sub":"88888888-8888-4888-8888-888888888802","role":"authenticated"}',true);
 begin perform public.resolve_my_inbox_item('88888888-8888-4888-8888-888888888845','accept'); raise exception 'other_owner_resolved'; exception when no_data_found then null; end;
end $$;
reset role;
rollback;
