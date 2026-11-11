-- A request-scoped extraction claim is a trusted-server attestation, not a
-- browser assertion. Replace the authenticated RPC with a service-only shape
-- that names the already-authenticated owner explicitly.

drop function public.create_my_wechat_file_import(
  text, text, bigint, text, text, text, text, date, text
);
drop function private.create_my_wechat_file_import(
  text, text, bigint, text, text, text, text, date, text
);

create function private.create_my_wechat_file_import(
  target_user_id uuid,
  target_content_sha256 text,
  target_mime_type text,
  target_size_bytes bigint,
  target_track text,
  target_company text,
  target_role_title text,
  target_location text,
  target_deadline date,
  target_evidence_excerpt text
)
returns table (
  wechat_projection_id uuid,
  inbox_item_id uuid,
  candidate_id uuid,
  created boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  upload_decision record;
  imported record;
  normalized_hash text := lower(trim(coalesce(target_content_sha256, '')));
  normalized_mime text := lower(trim(coalesce(target_mime_type, '')));
  internal_locator text;
begin
  if target_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into upload_decision
  from private.evaluate_permission(target_user_id, 'files.upload', null);
  if not upload_decision.allowed then
    raise exception 'file_upload_permission_denied:%', upload_decision.reason using errcode = '42501';
  end if;

  if normalized_hash !~ '^[0-9a-f]{64}$'
    or normalized_mime not in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    or target_size_bytes not between 1 and 5242880
  then
    raise exception 'invalid_wechat_file_import' using errcode = '22023';
  end if;

  -- Only service_role can reach this function. Set the request-local owner so
  -- the existing manual core reuses its privacy-lock, wechat.import,
  -- dependency, validation, idempotency, inbox, evidence, and audit checks.
  perform set_config('request.jwt.claim.sub', target_user_id::text, true);
  internal_locator := 'https://m7.local.invalid/file/' || normalized_hash;
  select * into imported
  from private.create_my_wechat_manual_import(
    'link', internal_locator, target_track, target_company, target_role_title,
    target_location, target_deadline, target_evidence_excerpt, false
  );

  update public.wechat_projections
  set source_kind = 'file', source_url = null
  where id = imported.wechat_projection_id and user_id = target_user_id;

  update public.evidence_refs
  set source_locator = 'wechat-manual:file:' || normalized_hash
  where id = (
    select evidence_id
    from public.wechat_projections
    where id = imported.wechat_projection_id and user_id = target_user_id
  );

  if imported.created then
    update public.audit_events
    set after_state = coalesce(after_state, '{}'::jsonb)
        || jsonb_build_object('source_kind', 'file'),
      permission_decision = coalesce(permission_decision, '{}'::jsonb)
        || jsonb_build_object(
          'files_upload_grant_id', upload_decision.grant_id,
          'attested_by', 'trusted_web_server',
          'request_scoped_extraction', true,
          'original_file_stored', false
        )
    where user_id = target_user_id
      and action = 'wechat.manual_imported'
      and object_type = 'wechat_projection'
      and object_id = imported.wechat_projection_id::text;
  end if;

  return query select imported.wechat_projection_id, imported.inbox_item_id,
    imported.candidate_id, imported.created;
end;
$$;

revoke all on function private.create_my_wechat_file_import(
  uuid, text, text, bigint, text, text, text, text, date, text
) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.create_my_wechat_file_import(
  uuid, text, text, bigint, text, text, text, text, date, text
) to service_role;

create function public.create_my_wechat_file_import(
  target_user_id uuid,
  target_content_sha256 text,
  target_mime_type text,
  target_size_bytes bigint,
  target_track text,
  target_company text,
  target_role_title text,
  target_location text,
  target_deadline date,
  target_evidence_excerpt text
)
returns table (
  wechat_projection_id uuid,
  inbox_item_id uuid,
  candidate_id uuid,
  created boolean
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.create_my_wechat_file_import(
    target_user_id, target_content_sha256, target_mime_type, target_size_bytes,
    target_track, target_company, target_role_title, target_location,
    target_deadline, target_evidence_excerpt
  );
$$;

revoke execute on function public.create_my_wechat_file_import(
  uuid, text, text, bigint, text, text, text, text, date, text
) from public, anon, authenticated;
grant execute on function public.create_my_wechat_file_import(
  uuid, text, text, bigint, text, text, text, text, date, text
) to service_role;
