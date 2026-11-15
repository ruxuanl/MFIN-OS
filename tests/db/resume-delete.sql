begin;
do $$
declare owner uuid; doc uuid:=gen_random_uuid(); ver uuid:=gen_random_uuid(); usage uuid:=gen_random_uuid(); opp uuid:=gen_random_uuid(); pkg uuid:=gen_random_uuid(); snap uuid:=gen_random_uuid(); analysis uuid; path text;
begin
 select id into owner from auth.users limit 1;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 update auth.users set last_sign_in_at=now() where id=owner;
 insert into public.privacy_locks(user_id,is_locked) values(owner,false) on conflict(user_id) do update set is_locked=false;
 path:=owner::text||'/'||ver::text||'/resume.pdf';
 insert into storage.objects(bucket_id,name) values('resume-files',path);
 insert into public.resume_documents(id,user_id,label,document_kind) values(doc,owner,'Synthetic deletion test','tailored');
 insert into public.resume_versions(id,user_id,document_id,version_number,storage_path,original_filename,mime_type,size_bytes,content_sha256,page_count,extracted_character_count)
 values(ver,owner,doc,1,path,'synthetic.pdf','application/pdf',100,repeat('d',64),1,100);
 insert into public.ai_usage_events(id,user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,provider) values(usage,owner,'resume',repeat('d',64),1,'deepseek');
 insert into public.ai_analyses(user_id,analysis_kind,resume_version_id,usage_event_id,provider,model,prompt_version,input_fingerprint,result)
 values(owner,'resume',ver,usage,'deepseek','deepseek-flash','synthetic',repeat('d',64),'{}') returning id into analysis;
 insert into public.opportunities(id,user_id,track,company,role_title) values(opp,owner,'internship','Synthetic','Synthetic');
 insert into public.application_packages(id,user_id,opportunity_id,selected_resume_version_id,selected_at,recommended_resume_version_id,rule_version) values(pkg,owner,opp,ver,now(),ver,'synthetic');
 insert into public.application_snapshots(id,user_id,opportunity_id,package_id,track,company,role_title,resume_version_id,resume_label,submitted_at,previous_state,opportunity_version_after) values(snap,owner,opp,pkg,'internship','Synthetic','Synthetic',ver,'Synthetic',now(),'{}',1);
 insert into public.application_drafts(user_id,opportunity_id,field_key,body,source,ai_analysis_id) values(owner,opp,'cover_letter','Synthetic draft','ai',analysis);
 perform public.resume_deletion_work(ver,'delete');
 if exists(select 1 from public.resume_versions where id=ver) or exists(select 1 from public.ai_analyses where resume_version_id=ver) then raise exception 'resume_not_deleted'; end if;
 if exists(select 1 from public.application_packages where id=pkg and (selected_resume_version_id is not null or selected_at is not null or recommended_resume_version_id is not null)) then raise exception 'package_reference_remained'; end if;
 if not exists(select 1 from public.application_snapshots where id=snap and resume_version_id is null and resume_label is null) then raise exception 'snapshot_reference_remained'; end if;
 if exists(select 1 from public.application_drafts where opportunity_id=opp) then raise exception 'draft_copy_remained'; end if;
 if not exists(select 1 from public.opportunities where id=opp) then raise exception 'opportunity_was_deleted'; end if;
 if not exists(select 1 from private.resume_deletion_jobs where version_id=ver and completed_at is null) then raise exception 'cleanup_not_pending'; end if;
 perform public.resume_deletion_work(ver,'delete'); -- idempotent
 perform public.resume_deletion_work(ver,'finish');
 if not exists(select 1 from private.resume_deletion_jobs where version_id=ver and completed_at is not null) then raise exception 'cleanup_not_completed'; end if;
 if not exists(select 1 from public.ai_usage_events where id=usage) then raise exception 'billing_history_deleted'; end if;
 update auth.users set last_sign_in_at=now()-interval '1 hour' where id=owner;
 begin perform public.resume_deletion_work(gen_random_uuid(),'delete');raise exception 'stale_auth_allowed';exception when insufficient_privilege then null;end;
end $$;
rollback;
