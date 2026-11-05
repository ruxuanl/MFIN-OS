-- Hosted Auth executes this hook as supabase_auth_admin, which intentionally
-- has no access to the extensions schema. PostgreSQL's built-in sha256 returns
-- the same 32-byte digest without broadening that role's schema permissions.

create or replace function public.before_user_created_single_user(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_email text;
  candidate_hash bytea;
begin
  if exists (select 1 from auth.users) then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This private workspace does not accept signups.'
      )
    );
  end if;

  normalized_email := lower(trim(coalesce(event->'user'->>'email', '')));
  if normalized_email = '' then
    return jsonb_build_object(
      'error', jsonb_build_object(
        'http_code', 403,
        'message', 'This private workspace does not accept signups.'
      )
    );
  end if;

  candidate_hash := pg_catalog.sha256(
    pg_catalog.convert_to(normalized_email, 'UTF8')
  );

  if exists (
    select 1
    from private.auth_signup_allowlist allowlist
    where allowlist.singleton
      and allowlist.email_hash = candidate_hash
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'This private workspace does not accept signups.'
    )
  );
end;
$$;
