-- Keep the credential audit metadata compatible with the global sensitive-key guard.
-- The payload records only the storage backend; no credential material enters audit_events.

create or replace function public.store_calendar_oauth_credentials(
  target_user_id uuid,
  target_secret_payload text,
  target_scopes text[],
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_record private.secret_references%rowtype;
  vault_id uuid;
  connection_id uuid;
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if length(target_secret_payload) > 16384 then
    raise exception 'calendar_secret_too_large' using errcode = '22023';
  end if;

  select * into secret_record from private.secret_references
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials'
  for update;

  if found and secret_record.vault_secret_id is not null then
    perform vault.update_secret(
      secret_record.vault_secret_id, target_secret_payload,
      'calendar-oauth-' || target_user_id::text,
      'Google Calendar OAuth credentials for isolated personal system', null
    );
    vault_id := secret_record.vault_secret_id;
    update private.secret_references
    set disabled_at = null, rotated_at = now()
    where id = secret_record.id;
  else
    vault_id := vault.create_secret(
      target_secret_payload,
      'calendar-oauth-' || target_user_id::text,
      'Google Calendar OAuth credentials for isolated personal system'
    );
    insert into private.secret_references (
      user_id, provider, secret_name, vault_secret_id, rotated_at, disabled_at
    ) values (
      target_user_id, 'calendar', 'oauth_credentials', vault_id, now(), null
    )
    on conflict (user_id, provider, secret_name) do update set
      vault_secret_id = excluded.vault_secret_id,
      rotated_at = now(), disabled_at = null
    returning * into secret_record;
  end if;

  select id into secret_record.id from private.secret_references
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials';

  insert into public.external_connections (
    user_id, provider, status, granted_scopes, secret_reference_id,
    last_success_at, last_error_code, last_error_at
  ) values (
    target_user_id, 'calendar', 'connected', target_scopes, secret_record.id,
    now(), null, null
  )
  on conflict (user_id, provider) do update set
    status = 'connected', granted_scopes = excluded.granted_scopes,
    secret_reference_id = excluded.secret_reference_id,
    last_success_at = now(), last_error_code = null, last_error_at = null
  returning id into connection_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'calendar.connected', 'external_connection', connection_id::text,
    jsonb_build_object('status', 'connected', 'scopes', target_scopes, 'expires_at', target_expires_at),
    jsonb_build_object('credential_storage', 'supabase_vault'), 'succeeded'
  );
  return connection_id;
end;
$$;
