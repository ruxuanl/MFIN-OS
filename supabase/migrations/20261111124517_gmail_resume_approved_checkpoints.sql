create extension if not exists pg_net with schema extensions;

create or replace function private.invoke_gmail_sync_cron()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  app_origin text;
  target_user_id uuid;
  permission record;
  automation_run_id uuid;
  run_key text;
  request_id bigint;
  checkpoint_pending boolean;
begin
  select decrypted_secret into app_origin
  from vault.decrypted_secrets
  where name = 'gmail_sync_app_origin'
  order by created_at desc
  limit 1;

  -- Test and unconfigured environments remain an explicit no-op.
  if app_origin is null or app_origin !~ '^https://[A-Za-z0-9.-]+$' then
    return null;
  end if;

  select ec.user_id into target_user_id
  from public.external_connections ec
  where ec.provider = 'gmail' and ec.status = 'connected'
  order by ec.created_at
  limit 1
  for update skip locked;
  if target_user_id is null then return null; end if;

  select * into permission
  from private.evaluate_permission(target_user_id, 'gmail.sync', null);
  if not coalesce(permission.allowed, false) then return null; end if;

  select exists(select 1 from private.gmail_sync_work w where w.user_id=target_user_id
    and w.state is not null
    and not (w.state->>'mode'='full' and not coalesce((w.state->>'backfillApproved')::boolean,false)
      and coalesce((w.state->>'fullProcessed')::int,0)>=50))
    into checkpoint_pending;
  if exists(select 1 from private.gmail_sync_work w where w.user_id=target_user_id and w.lease_until>now()) then return null; end if;
  if not checkpoint_pending and extract(minute from now())::int % 15 <> 0 then return null; end if;

  run_key := 'gmail-scheduled:' || to_char(
    date_bin(case when checkpoint_pending then interval '1 minute' else interval '15 minutes' end, now(), timestamptz '2000-01-01 00:00:00+00'),
    'YYYYMMDD"T"HH24MI"Z"'
  );

  insert into public.automation_runs (
    user_id, capability_key, permission_grant_id, idempotency_key,
    status, progress, safe_checkpoint, permission_snapshot, input_reference
  ) values (
    target_user_id, 'gmail.sync', permission.grant_id, run_key,
    'queued', 0, 'cron_dispatched',
    jsonb_build_object('allowed', true, 'reason', permission.reason),
    jsonb_build_object('trigger', 'supabase_cron', 'intervalMinutes', 15)
  ) on conflict (user_id, idempotency_key) do nothing
  returning id into automation_run_id;
  if automation_run_id is null then return null; end if;

  select net.http_post(
    url := rtrim(app_origin, '/') || '/api/internal/gmail-sync',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('runId', automation_run_id),
    timeout_milliseconds := 65000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.invoke_gmail_sync_cron() from public, anon, authenticated;
grant execute on function private.invoke_gmail_sync_cron() to service_role;

do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'gmail-readonly-sync-15m';

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'gmail-readonly-sync-15m',
    '* * * * *',
    $cron$select private.invoke_gmail_sync_cron();$cron$
  );
end;
$$;
