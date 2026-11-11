-- D25: user-approved retirement; source history remains readable.
-- D26: only these three existing grants become persistent.
with changed as (
  update public.permission_grants
  set mode='persistent', active=true, expires_at=null, operation_id=null, starts_at=now(), updated_at=now()
  where capability_key in ('reports.generate','calendar.update_product_event','calendar.write_confirmed_plan')
  returning user_id, capability_key
)
insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
select user_id,'user','maintenance.restore_approved_grant','permission_grant',capability_key,
  jsonb_build_object('mode','persistent','decision','D26'),'succeeded' from changed;

update public.permission_grants set mode='off',active=false,expires_at=null,operation_id=null
where capability_key like 'wechat.%';

update public.automation_runs set status='cancelled', finished_at=now(),
  safe_checkpoint='feature_retired',last_error_code='feature_retired',
  last_error_summary='WeChat capability permanently retired by user decision D25.'
where capability_key like 'wechat.%' and status in ('queued','running','retry_wait','paused');

create function private.reject_retired_wechat_grant() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.capability_key like 'wechat.%' and (new.active or new.mode <> 'off') then
    raise exception 'feature_retired' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function private.reject_retired_wechat_grant() from public,anon,authenticated,service_role;
create trigger reject_retired_wechat_grant before insert or update on public.permission_grants
for each row execute function private.reject_retired_wechat_grant();

create function private.reject_retired_wechat_write() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'feature_retired' using errcode='42501';
end $$;
revoke all on function private.reject_retired_wechat_write() from public,anon,authenticated,service_role;

do $$
declare item record;
begin
  -- Revoke old RPCs, including service-only capture and pairing paths.
  for item in select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','private') and p.proname ilike '%wechat%'
  loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
      item.nspname,item.proname,item.args);
  end loop;
  -- Keep evidence and projection tables, but make every dedicated table read-only.
  for item in select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind='r' and c.relname like 'wechat_%'
  loop
    execute format('revoke insert,update,delete,truncate,references,trigger on table %I.%I from anon,authenticated,service_role',item.nspname,item.relname);
    execute format('create trigger reject_retired_wechat_write before insert or update or delete on %I.%I for each row execute function private.reject_retired_wechat_write()',item.nspname,item.relname);
  end loop;
  for item in select jobid from cron.job where jobname ilike '%wechat%'
  loop perform cron.unschedule(item.jobid); end loop;
end $$;
