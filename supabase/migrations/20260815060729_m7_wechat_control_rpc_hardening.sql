-- Keep the authenticated Data API surface invoker-only. Privileged writes live
-- in the non-exposed private schema and retain explicit auth.uid()/ownership
-- checks from the preceding migration.

alter function public.create_my_wechat_allowlist_group(text, text, text)
  set schema private;
alter function public.set_my_wechat_allowlist_group(uuid, text, boolean)
  set schema private;
alter function public.set_my_wechat_monitor_state(text)
  set schema private;

revoke all on function private.create_my_wechat_allowlist_group(text, text, text)
  from public, anon, authenticated;
revoke all on function private.set_my_wechat_allowlist_group(uuid, text, boolean)
  from public, anon, authenticated;
revoke all on function private.set_my_wechat_monitor_state(text)
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.create_my_wechat_allowlist_group(text, text, text)
  to authenticated;
grant execute on function private.set_my_wechat_allowlist_group(uuid, text, boolean)
  to authenticated;
grant execute on function private.set_my_wechat_monitor_state(text)
  to authenticated;

create function public.create_my_wechat_allowlist_group(
  target_stable_group_key text,
  target_identity_fingerprint text,
  target_display_label text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_my_wechat_allowlist_group(
    target_stable_group_key,
    target_identity_fingerprint,
    target_display_label
  );
$$;

create function public.set_my_wechat_allowlist_group(
  target_group_id uuid,
  target_display_label text,
  target_enabled boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_my_wechat_allowlist_group(
    target_group_id,
    target_display_label,
    target_enabled
  );
$$;

create function public.set_my_wechat_monitor_state(target_state text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.set_my_wechat_monitor_state(target_state);
$$;

revoke execute on function public.create_my_wechat_allowlist_group(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.set_my_wechat_allowlist_group(uuid, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.set_my_wechat_monitor_state(text)
  from public, anon, authenticated;

grant execute on function public.create_my_wechat_allowlist_group(text, text, text)
  to authenticated;
grant execute on function public.set_my_wechat_allowlist_group(uuid, text, boolean)
  to authenticated;
grant execute on function public.set_my_wechat_monitor_state(text)
  to authenticated;
