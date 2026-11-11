-- The reviewed M3 RLS predicate is intentionally executable by authenticated
-- users: it returns only a boolean after checking auth.uid() and privacy lock.
-- A historical blanket private-function revoke removed this grant in Test.

grant usage on schema private to authenticated, service_role;
revoke execute on function private.m3_writes_allowed(uuid) from public, anon;
grant execute on function private.m3_writes_allowed(uuid) to authenticated, service_role;
