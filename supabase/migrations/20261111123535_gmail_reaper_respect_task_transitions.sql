create or replace function private.reap_stale_gmail_runs() returns void language plpgsql security definer set search_path='' as $$
begin
  update public.automation_runs set status=case when status='queued' then 'cancelled' else 'failed' end,finished_at=now(),
    safe_checkpoint='worker_lease_expired',last_error_code='gmail_worker_expired',
    last_error_summary='Worker did not record completion before the maximum execution window.'
  where capability_key='gmail.sync' and status in ('queued','running')
    and created_at<now()-interval '10 minutes';
end $$;
revoke all on function private.reap_stale_gmail_runs() from public,anon,authenticated;
grant execute on function private.reap_stale_gmail_runs() to service_role;
select private.reap_stale_gmail_runs();
