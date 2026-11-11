-- RLS and the SECURITY INVOKER mutation RPCs must be able to evaluate the
-- privacy-lock predicate. This is the only private function exposed to the
-- authenticated role; it checks auth.uid() and returns only a boolean.
grant usage on schema private to authenticated, service_role;
revoke execute on function private.m3_writes_allowed(uuid) from public, anon;
grant execute on function private.m3_writes_allowed(uuid) to authenticated, service_role;
