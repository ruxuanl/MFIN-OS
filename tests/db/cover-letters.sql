-- All synthetic rows and permission probes roll back. No actual resume or mail content.
begin;
do $$
declare owner uuid; job uuid:=gen_random_uuid(); doc uuid:=gen_random_uuid(); resume uuid:=gen_random_uuid(); usage uuid; analysis uuid; base_version bigint;
begin
 select id into owner from auth.users limit 1;
 perform set_config('request.jwt.claim.sub',owner::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',owner,'role','authenticated')::text,true);
 insert into public.opportunities(id,user_id,company,role_title,track) values(job,owner,'Synthetic Letter QA','Research Intern','internship');
 insert into public.resume_documents(id,user_id,label,document_kind) values(doc,owner,'Synthetic QA resume','tailored');
 insert into storage.objects(bucket_id,name) values('resume-files',owner||'/synthetic/'||resume||'.pdf');
 insert into public.resume_versions(id,user_id,document_id,version_number,storage_path,original_filename,mime_type,size_bytes,content_sha256,extracted_character_count)
 values(resume,owner,doc,1,owner||'/synthetic/'||resume||'.pdf','synthetic.pdf','application/pdf',1,repeat('a',64),1);
 base_version:=public.save_my_application_draft(job,'cover_letter_base',null,'Synthetic baseline',null);
 insert into public.ai_usage_events(user_id,analysis_kind,input_fingerprint,reserved_hkd_cents,actual_hkd_cents,status,model)
 values(owner,'application_pack',repeat('b',64),1,0,'completed','deepseek-flash') returning id into usage;
 insert into public.ai_analyses(user_id,analysis_kind,opportunity_id,resume_version_id,usage_event_id,model,prompt_version,input_fingerprint,result)
 values(owner,'application_pack',job,resume,usage,'deepseek-flash','cover_letter_v1',repeat('b',64),'{"coverLetter":{"text":"Synthetic optimized text","confidence":"high","evidence":[{"claim":"Baseline","source":"default","quote":"Synthetic baseline"}],"missingInfo":[]}}') returning id into analysis;
 if public.apply_my_application_pack(analysis)<>1 then raise exception 'AI_not_applied'; end if;
 if (select body from public.application_drafts where opportunity_id=job and field_key='cover_letter_base')<>'Synthetic baseline' then raise exception 'baseline_overwritten'; end if;
 perform public.save_my_application_draft(job,'cover_letter',null,'User edited optimized text',(select version from public.application_drafts where opportunity_id=job and field_key='cover_letter'));
 if public.apply_my_application_pack(analysis)<>0 then raise exception 'locked_AI_overwritten'; end if;
 begin
  perform public.save_my_application_draft(job,'cover_letter_base',null,'stale',base_version+10);
  raise exception 'expected_conflict';
 exception when serialization_failure then null; end;
 update public.permission_grants set active=false where user_id=owner and capability_key='ai.material_draft';
 begin
  perform public.apply_my_application_pack(analysis);raise exception 'permission_not_enforced';
 exception when insufficient_privilege then null;end;
 begin
  insert into public.privacy_locks(user_id,is_locked,locked_at) values(owner,true,now()) on conflict(user_id) do update set is_locked=true,locked_at=now();
  begin
   perform public.save_my_application_draft(job,'cover_letter_base',null,'must not save',base_version);
   raise exception 'privacy_lock_not_enforced';
  exception when insufficient_privilege then null;end;
  raise exception 'rollback_privacy_probe';
 exception when others then
  if sqlerrm<>'rollback_privacy_probe' then raise;end if;
 end;
 if has_function_privilege('anon','public.save_my_application_draft(uuid,text,text,text,bigint)','execute') then raise exception 'anon_write'; end if;
end $$;
rollback;
