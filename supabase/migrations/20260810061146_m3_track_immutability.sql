create or replace function private.enforce_workspace_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id <> old.user_id then
    raise exception 'workspace_owner_is_immutable' using errcode = '23514';
  end if;

  if tg_table_name = 'opportunity_candidates' and new.track <> old.track then
    raise exception 'candidate_track_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'opportunities' and (
    new.track <> old.track
    or new.candidate_id is distinct from old.candidate_id
    or new.intent <> old.intent
  ) then
    raise exception 'opportunity_identity_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'actions' and (
    new.context_type <> old.context_type
    or new.context_id is distinct from old.context_id
    or new.track is distinct from old.track
  ) then
    raise exception 'action_context_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'custom_field_definitions' and new.scope <> old.scope then
    raise exception 'custom_field_scope_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'custom_field_values' and (
    new.definition_id <> old.definition_id
    or new.entity_type <> old.entity_type
    or new.entity_id <> old.entity_id
  ) then
    raise exception 'custom_field_identity_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger opportunity_candidates_identity_guard
before update on public.opportunity_candidates
for each row execute function private.enforce_workspace_identity();
create trigger opportunities_identity_guard
before update on public.opportunities
for each row execute function private.enforce_workspace_identity();
create trigger actions_identity_guard
before update on public.actions
for each row execute function private.enforce_workspace_identity();
create trigger custom_field_definitions_identity_guard
before update on public.custom_field_definitions
for each row execute function private.enforce_workspace_identity();
create trigger custom_field_values_identity_guard
before update on public.custom_field_values
for each row execute function private.enforce_workspace_identity();

revoke execute on function private.enforce_workspace_identity() from public, anon, authenticated;
