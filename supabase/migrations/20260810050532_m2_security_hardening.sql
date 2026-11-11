-- M2 advisor hardening: defense-in-depth for the private schema and FK indexes.

alter table private.secret_references enable row level security;

create index audit_event_evidence_evidence_idx
  on public.audit_event_evidence (evidence_id);
create index automation_attempts_user_idx
  on public.automation_attempts (user_id);
create index automation_runs_capability_idx
  on public.automation_runs (capability_key);
create index automation_runs_permission_grant_idx
  on public.automation_runs (permission_grant_id)
  where permission_grant_id is not null;
create index capability_dependencies_required_idx
  on public.capability_dependencies (required_capability_key);
create index external_connections_secret_ref_idx
  on public.external_connections (secret_reference_id)
  where secret_reference_id is not null;
create index permission_grants_capability_idx
  on public.permission_grants (capability_key);
create index undo_operations_audit_event_idx
  on public.undo_operations (audit_event_id);

drop policy undo_operations_write_own on public.undo_operations;

create policy undo_operations_insert_own on public.undo_operations
for insert to authenticated with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.privacy_locks
    where user_id = (select auth.uid()) and is_locked
  )
);

create policy undo_operations_update_own on public.undo_operations
for update to authenticated
using (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.privacy_locks
    where user_id = (select auth.uid()) and is_locked
  )
)
with check (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.privacy_locks
    where user_id = (select auth.uid()) and is_locked
  )
);

create policy undo_operations_delete_own on public.undo_operations
for delete to authenticated using (
  (select auth.uid()) = user_id
  and not exists (
    select 1 from public.privacy_locks
    where user_id = (select auth.uid()) and is_locked
  )
);
