-- M7's blanket private-function revoke also removed the reviewed predicate
-- used by M3 owner-scoped RLS policies. The function checks auth.uid() and
-- the user's privacy lock, and returns only a boolean.
grant usage on schema private to authenticated, service_role;
revoke execute on function private.m3_writes_allowed(uuid) from public, anon;
grant execute on function private.m3_writes_allowed(uuid) to authenticated, service_role;
