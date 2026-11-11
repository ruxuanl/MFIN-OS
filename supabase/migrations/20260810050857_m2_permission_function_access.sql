-- The public SECURITY INVOKER wrapper needs permission to call only the
-- owner-checking evaluator. No private tables or other functions are exposed.

grant usage on schema private to authenticated, service_role;
grant execute on function private.evaluate_permission(uuid, text, uuid)
  to authenticated, service_role;
