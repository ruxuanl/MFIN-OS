create table private.resume_deletion_jobs (
 user_id uuid not null references auth.users(id) on delete cascade,
 version_id uuid primary key, storage_path text not null, created_at timestamptz not null default now(), completed_at timestamptz
);
alter table private.resume_deletion_jobs enable row level security;
revoke all on private.resume_deletion_jobs from public,anon,authenticated;

create or replace function private.guard_application_snapshot() returns trigger language plpgsql set search_path='' as $$
begin
 if new.resume_version_id is null and new.resume_label is null
  and exists(select 1 from private.resume_deletion_jobs j where j.version_id=old.resume_version_id and j.user_id=old.user_id)
  and (to_jsonb(new)-'resume_version_id'-'resume_label')=(to_jsonb(old)-'resume_version_id'-'resume_label') then return new; end if;
 if old.status='active' and new.status='undone' and new.undone_at is not null
  and (to_jsonb(new)-'status'-'undone_at')=(to_jsonb(old)-'status'-'undone_at') then return new; end if;
 raise exception 'application_snapshot_is_immutable' using errcode='23514';
end; $$;

create function private.resume_deletion_work(target uuid, action text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare owner uuid:=auth.uid(); v public.resume_versions%rowtype; recent timestamptz; result jsonb;
begin
 if owner is null then raise exception 'authentication_required' using errcode='42501'; end if;
 if action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',version_id,'path',storage_path,'pending',completed_at is null)),'[]'::jsonb) into result from private.resume_deletion_jobs where user_id=owner;
  return result;
 end if;
 if not private.m3_writes_allowed(owner) then raise exception 'privacy_lock' using errcode='42501'; end if;
 if action='finish' then update private.resume_deletion_jobs set completed_at=now() where version_id=target and user_id=owner; return 'true'; end if;
 if action<>'delete' then raise exception 'invalid_action'; end if;
 select last_sign_in_at into recent from auth.users where id=owner;
 if recent is null or recent<now()-interval '10 minutes' then raise exception 'fresh_reauthentication_required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text||':resume-delete',0));
 select * into v from public.resume_versions where id=target and user_id=owner for update;
 if not found then
  if exists(select 1 from private.resume_deletion_jobs where user_id=owner and version_id=target) then return 'true'; end if;
  raise exception 'resume_version_not_found';
 end if;
 insert into private.resume_deletion_jobs(user_id,version_id,storage_path) values(owner,v.id,v.storage_path);
 delete from public.application_drafts where user_id=owner and ai_analysis_id in(select id from public.ai_analyses where user_id=owner and resume_version_id=target);
 delete from public.ai_analyses where user_id=owner and resume_version_id=target;
 delete from public.opportunity_resume_assignments where user_id=owner and resume_version_id=target;
 update public.application_packages set selected_resume_version_id=null,selected_at=null,status=case when status='ready' then 'draft' else status end where user_id=owner and selected_resume_version_id=target;
 update public.application_packages set recommended_resume_version_id=null,recommendation_reason=null where user_id=owner and recommended_resume_version_id=target;
 update public.application_snapshots set resume_version_id=null,resume_label=null where user_id=owner and resume_version_id=target;
 delete from public.resume_versions where id=target and user_id=owner;
 delete from public.resume_documents d where d.id=v.document_id and d.user_id=owner and not exists(select 1 from public.resume_versions r where r.document_id=d.id);
 insert into public.audit_events(user_id,actor_type,action,object_type,object_id,outcome) values(owner,'user','resume.version_deleted','resume_version',target::text,'succeeded');
 return 'true';
end; $$;
revoke all on function private.resume_deletion_work(uuid,text) from public,anon,authenticated;
grant execute on function private.resume_deletion_work(uuid,text) to authenticated;
create function public.resume_deletion_work(target uuid default null,action text default 'list') returns jsonb
language sql security invoker set search_path='' as $$ select private.resume_deletion_work(target,action); $$;
revoke all on function public.resume_deletion_work(uuid,text) from public,anon;
grant execute on function public.resume_deletion_work(uuid,text) to authenticated;
notify pgrst,'reload schema';
