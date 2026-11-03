create or replace function private.enforce_workspace_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_payload jsonb := to_jsonb(old);
  new_payload jsonb := to_jsonb(new);
begin
  if new_payload -> 'user_id' is distinct from old_payload -> 'user_id' then
    raise exception 'workspace_owner_is_immutable' using errcode = '23514';
  end if;

  if tg_table_name = 'opportunity_candidates'
     and new_payload -> 'track' is distinct from old_payload -> 'track' then
    raise exception 'candidate_track_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'opportunities' and (
    new_payload -> 'track' is distinct from old_payload -> 'track'
    or new_payload -> 'candidate_id' is distinct from old_payload -> 'candidate_id'
    or new_payload -> 'intent' is distinct from old_payload -> 'intent'
  ) then
    raise exception 'opportunity_identity_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'actions' and (
    new_payload -> 'context_type' is distinct from old_payload -> 'context_type'
    or new_payload -> 'context_id' is distinct from old_payload -> 'context_id'
    or new_payload -> 'track' is distinct from old_payload -> 'track'
  ) then
    raise exception 'action_context_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'custom_field_definitions'
     and new_payload -> 'scope' is distinct from old_payload -> 'scope' then
    raise exception 'custom_field_scope_is_immutable' using errcode = '23514';
  elsif tg_table_name = 'custom_field_values' and (
    new_payload -> 'definition_id' is distinct from old_payload -> 'definition_id'
    or new_payload -> 'entity_type' is distinct from old_payload -> 'entity_type'
    or new_payload -> 'entity_id' is distinct from old_payload -> 'entity_id'
  ) then
    raise exception 'custom_field_identity_is_immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke execute on function private.enforce_workspace_identity() from public, anon, authenticated;
