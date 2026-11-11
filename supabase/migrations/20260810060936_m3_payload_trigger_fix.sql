create or replace function private.reject_m3_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_payload jsonb := to_jsonb(new);
begin
  if tg_table_name = 'timeline_entries' and private.contains_sensitive_key(row_payload -> 'changes') then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'custom_field_definitions' and private.contains_sensitive_key(row_payload -> 'options') then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'custom_field_values' and private.contains_sensitive_key(row_payload -> 'value') then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'saved_views' and (
    private.contains_sensitive_key(row_payload -> 'filters')
    or private.contains_sensitive_key(row_payload -> 'sort_spec')
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'client_mutations' and (
    private.contains_sensitive_key(row_payload -> 'patch')
    or private.contains_sensitive_key(row_payload -> 'result')
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'sync_conflicts' and (
    private.contains_sensitive_key(row_payload -> 'base_value')
    or private.contains_sensitive_key(row_payload -> 'local_value')
    or private.contains_sensitive_key(row_payload -> 'server_value')
    or private.contains_sensitive_key(row_payload -> 'resolved_value')
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.reject_m3_sensitive_payload() from public, anon, authenticated;
