-- Fail closed before Supabase Auth creates a user. The only allowed email is
-- stored as a SHA-256 digest in a private singleton row and is seeded per
-- environment, never in repository history.

create table private.auth_signup_allowlist (
  singleton boolean primary key default true check (singleton),
  email_hash bytea not null unique check (octet_length(email_hash) = 32),
  created_at timestamptz not null default now()
);

alter table private.auth_signup_allowlist enable row level security;

create policy auth_signup_allowlist_hook_read
on private.auth_signup_allowlist
for select
to supabase_auth_admin
using (true);

revoke all on table private.auth_signup_allowlist from public, anon, authenticated, service_role;
grant select on table private.auth_signup_allowlist to supabase_auth_admin;
grant usage on schema private to supabase_auth_admin;

create function public.before_user_created_single_user(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  normalized_email text;
  candidate_hash bytea;
begin
  -- No second Auth user is ever allowed, even if configuration drifts.
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

revoke all on function public.before_user_created_single_user(jsonb)
from public, anon, authenticated, service_role;
grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_single_user(jsonb)
to supabase_auth_admin;
