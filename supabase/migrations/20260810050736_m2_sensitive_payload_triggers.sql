-- Each trigger function is bound to one row type. PostgreSQL resolves NEW fields
-- when compiling the function, even when another TG_TABLE_NAME branch would run.

drop trigger audit_events_sensitive_payload on public.audit_events;
drop trigger undo_operations_sensitive_payload on public.undo_operations;
drop trigger automation_runs_sensitive_payload on public.automation_runs;
drop function private.reject_sensitive_payload();

create or replace function private.reject_audit_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.contains_sensitive_key(new.before_state)
     or private.contains_sensitive_key(new.after_state)
     or private.contains_sensitive_key(new.permission_decision) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.reject_undo_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.contains_sensitive_key(new.compensation_payload) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create or replace function private.reject_automation_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.contains_sensitive_key(new.permission_snapshot)
     or private.contains_sensitive_key(new.input_reference)
     or private.contains_sensitive_key(new.result_reference) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger audit_events_sensitive_payload
before insert or update on public.audit_events
for each row execute function private.reject_audit_sensitive_payload();
create trigger undo_operations_sensitive_payload
before insert or update on public.undo_operations
for each row execute function private.reject_undo_sensitive_payload();
create trigger automation_runs_sensitive_payload
before insert or update on public.automation_runs
for each row execute function private.reject_automation_sensitive_payload();

revoke execute on function private.reject_audit_sensitive_payload() from public, anon, authenticated;
revoke execute on function private.reject_undo_sensitive_payload() from public, anon, authenticated;
revoke execute on function private.reject_automation_sensitive_payload() from public, anon, authenticated;
