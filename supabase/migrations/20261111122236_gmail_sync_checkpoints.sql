create table private.gmail_sync_work (
  user_id uuid primary key references auth.users(id) on delete cascade,
  lease_token uuid,
  lease_until timestamptz,
  state jsonb,
  updated_at timestamptz not null default now(),
  check (state is null or pg_column_size(state) <= 262144)
);
alter table private.gmail_sync_work enable row level security;
revoke all on private.gmail_sync_work from public,anon,authenticated;
grant select,insert,update,delete on private.gmail_sync_work to service_role;

create function public.claim_gmail_sync_work(target_user_id uuid,target_token uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare work private.gmail_sync_work; permission record;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_user_id::text||':gmail-sync',0));
  select * into permission from private.evaluate_permission(target_user_id,'gmail.sync',null);
  if not coalesce(permission.allowed,false) then raise exception 'gmail_permission_denied' using errcode='42501'; end if;
  insert into private.gmail_sync_work(user_id) values(target_user_id) on conflict do nothing;
  select * into work from private.gmail_sync_work where user_id=target_user_id for update;
  if work.lease_until > now() then return null; end if;
  update private.gmail_sync_work set lease_token=target_token,lease_until=now()+interval '2 minutes',updated_at=now() where user_id=target_user_id;
  return jsonb_build_object('state',work.state);
end $$;
create function public.save_gmail_sync_work(target_user_id uuid,target_token uuid,target_state jsonb,target_release boolean)
returns void language plpgsql security invoker set search_path='' as $$
begin
  update private.gmail_sync_work set state=target_state,
    lease_until=case when target_release then null else lease_until end,
    lease_token=case when target_release then null else lease_token end,updated_at=now()
  where user_id=target_user_id and lease_token=target_token and lease_until>now();
  if not found then raise exception 'gmail_sync_lease_lost' using errcode='42501'; end if;
end $$;
revoke all on function public.claim_gmail_sync_work(uuid,uuid),public.save_gmail_sync_work(uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.claim_gmail_sync_work(uuid,uuid),public.save_gmail_sync_work(uuid,uuid,jsonb,boolean) to service_role;

-- Bound requests run for at most 60 seconds. Older nonterminal records have lost their worker.
create function private.reap_stale_gmail_runs() returns void language plpgsql security definer set search_path='' as $$
begin
  update public.automation_runs set status='failed',finished_at=now(),
    safe_checkpoint='worker_lease_expired',last_error_code='gmail_worker_expired',
    last_error_summary='Worker did not record completion before the maximum execution window.'
  where capability_key='gmail.sync' and status in ('queued','running')
    and created_at<now()-interval '10 minutes';
end $$;
revoke all on function private.reap_stale_gmail_runs() from public,anon,authenticated;
grant execute on function private.reap_stale_gmail_runs() to service_role;
select cron.schedule('gmail-reap-stale-runs','*/5 * * * *','select private.reap_stale_gmail_runs();');
select private.reap_stale_gmail_runs();
