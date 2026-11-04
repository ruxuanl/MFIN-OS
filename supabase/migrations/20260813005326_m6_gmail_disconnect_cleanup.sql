create or replace function public.delete_gmail_oauth_credentials(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare vault_id uuid;
begin
  select vault_secret_id into vault_id from private.secret_references
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials'
  for update;
  if vault_id is not null then delete from vault.secrets where id = vault_id; end if;
  update private.secret_references set vault_secret_id = null, disabled_at = now()
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials';
  delete from private.gmail_sync_cursors where user_id = target_user_id;
  update public.external_connections
  set status = 'disconnected', secret_reference_id = null, granted_scopes = '{}',
      last_error_code = null, last_error_at = null
  where user_id = target_user_id and provider = 'gmail';
  update public.automation_runs
  set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
      finished_at = case when status = 'queued' then now() else finished_at end,
      safe_checkpoint = 'gmail_disconnected'
  where user_id = target_user_id and capability_key in ('gmail.sync', 'gmail.rules_extract')
    and status in ('queued', 'running');
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'gmail.disconnected', 'external_connection', target_user_id::text,
    jsonb_build_object('status', 'disconnected'),
    jsonb_build_object('credential_deleted', vault_id is not null, 'cursor_deleted', true), 'succeeded'
  );
  return vault_id is not null;
end;
$$;
