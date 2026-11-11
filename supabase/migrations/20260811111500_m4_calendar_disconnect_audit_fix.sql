-- Keep disconnect auditing compatible with the sensitive-payload guard.

create or replace function public.delete_calendar_oauth_credentials(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_id uuid;
begin
  select vault_secret_id into vault_id
  from private.secret_references
  where user_id = target_user_id
    and provider = 'calendar'
    and secret_name = 'oauth_credentials'
  for update;

  if vault_id is not null then
    delete from vault.secrets where id = vault_id;
  end if;

  update private.secret_references
  set vault_secret_id = null,
      disabled_at = now()
  where user_id = target_user_id
    and provider = 'calendar'
    and secret_name = 'oauth_credentials';

  update public.external_connections
  set status = 'disconnected',
      secret_reference_id = null,
      last_error_code = null,
      last_error_at = null
  where user_id = target_user_id
    and provider = 'calendar';

  update public.calendar_sources
  set sync_state = 'paused'
  where user_id = target_user_id;

  update public.calendar_sync_operations
  set status = 'cancelled',
      finished_at = now(),
      blocked_reason = 'connection_disconnected'
  where user_id = target_user_id
    and status in ('pending', 'processing');

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'calendar.disconnected', 'external_connection', target_user_id::text,
    jsonb_build_object('status', 'disconnected'),
    jsonb_build_object('credential_deleted', vault_id is not null), 'succeeded'
  );

  return vault_id is not null;
end;
$$;
