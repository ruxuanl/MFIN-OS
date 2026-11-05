-- Only the trusted Web server may attest that the request-scoped source file
-- was deleted. Authenticated browsers retain owner SELECT on metadata but can
-- no longer call the recording RPC directly.

revoke execute on function public.record_my_wechat_screenshot_intake(text, text, bigint)
  from public, anon, authenticated;
drop function public.record_my_wechat_screenshot_intake(text, text, bigint);

revoke all on function private.record_my_wechat_screenshot_intake(text, text, bigint)
  from public, anon, authenticated;
drop function private.record_my_wechat_screenshot_intake(text, text, bigint);

create function private.record_my_wechat_screenshot_intake(
  target_user_id uuid,
  target_content_sha256 text,
  target_mime_type text,
  target_size_bytes bigint
)
returns table (
  screenshot_intake_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  import_decision record;
  upload_decision record;
  normalized_hash text := lower(trim(coalesce(target_content_sha256, '')));
  normalized_mime text := lower(trim(coalesce(target_mime_type, '')));
  new_intake_id uuid;
begin
  if target_user_id is null then
    raise exception 'target_user_required' using errcode = '22023';
  end if;

  select * into import_decision
  from private.evaluate_permission(target_user_id, 'wechat.import', null);
  if not import_decision.allowed then
    raise exception 'wechat_import_permission_denied:%', import_decision.reason using errcode = '42501';
  end if;

  select * into upload_decision
  from private.evaluate_permission(target_user_id, 'files.upload', null);
  if not upload_decision.allowed then
    raise exception 'file_upload_permission_denied:%', upload_decision.reason using errcode = '42501';
  end if;

  if normalized_hash !~ '^[0-9a-f]{64}$'
    or normalized_mime not in ('image/png', 'image/jpeg', 'image/webp')
    or target_size_bytes not between 1 and 5242880
  then
    raise exception 'invalid_wechat_screenshot_intake' using errcode = '22023';
  end if;

  insert into public.wechat_screenshot_intakes (
    user_id, content_sha256, mime_type, size_bytes
  ) values (
    target_user_id, normalized_hash, normalized_mime, target_size_bytes
  )
  on conflict (user_id, content_sha256) do nothing
  returning id into new_intake_id;

  if new_intake_id is null then
    select id into new_intake_id
    from public.wechat_screenshot_intakes
    where user_id = target_user_id and content_sha256 = normalized_hash;
    return query select new_intake_id, false;
    return;
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, rule_version, confidence, outcome
  ) values (
    target_user_id, 'user', 'wechat.screenshot_intake_recorded',
    'wechat_screenshot_intake', new_intake_id::text,
    jsonb_build_object(
      'mime_type', normalized_mime,
      'size_bytes', target_size_bytes,
      'processing_status', 'ocr_unavailable',
      'retention_mode', 'request_scoped_delete',
      'source_deleted', true
    ),
    jsonb_build_object(
      'allowed', true,
      'wechat_import_grant_id', import_decision.grant_id,
      'files_upload_grant_id', upload_decision.grant_id,
      'attested_by', 'trusted_web_server'
    ),
    'wechat_screenshot_intake_v1', 1, 'succeeded'
  );

  return query select new_intake_id, true;
end;
$$;

revoke all on function private.record_my_wechat_screenshot_intake(uuid, text, text, bigint)
  from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.record_my_wechat_screenshot_intake(uuid, text, text, bigint)
  to service_role;

create function public.record_my_wechat_screenshot_intake(
  target_user_id uuid,
  target_content_sha256 text,
  target_mime_type text,
  target_size_bytes bigint
)
returns table (
  screenshot_intake_id uuid,
  created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.record_my_wechat_screenshot_intake(
    target_user_id,
    target_content_sha256,
    target_mime_type,
    target_size_bytes
  );
$$;

revoke execute on function public.record_my_wechat_screenshot_intake(uuid, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.record_my_wechat_screenshot_intake(uuid, text, text, bigint)
  to service_role;
