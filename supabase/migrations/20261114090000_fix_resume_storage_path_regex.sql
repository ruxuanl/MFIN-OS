-- Fix: resume uploads were always rejected with invalid_resume_version.
-- 20260831005716 wrote the storage-path check as '.../resume\\.(pdf|docx)$'. With
-- standard_conforming_strings on (the Postgres/Supabase default) that regex demands a literal
-- backslash before the extension, so a real path like '<uid>/<version>/resume.pdf' never matched.
-- The function is redefined unchanged apart from the regex ('resume\.(pdf|docx)$').

create or replace function private.register_resume_version(
  target_version_id uuid,
  target_document_id uuid,
  target_label text,
  target_document_kind text,
  target_storage_path text,
  target_original_filename text,
  target_mime_type text,
  target_size_bytes integer,
  target_content_sha256 text,
  target_page_count integer,
  target_extracted_character_count integer,
  target_source_version_id uuid
)
returns table(document_id uuid, version_id uuid, version_number integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  resolved_document_id uuid := target_document_id;
  next_version integer;
  existing_version public.resume_versions%rowtype;
begin
  if actor_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not private.m3_writes_allowed(actor_user_id) then raise exception 'privacy_locked' using errcode = '42501'; end if;
  if not exists (
    select 1 from private.evaluate_permission(actor_user_id, 'files.upload', null)
    where allowed
  ) then raise exception 'files_upload_permission_denied' using errcode = '42501'; end if;
  if target_version_id is null
    or target_label is null or length(btrim(target_label)) not between 1 and 160
    or target_document_kind not in ('master', 'tailored')
    or target_storage_path is null or target_storage_path !~ ('^' || actor_user_id::text || '/[0-9a-f-]{36}/resume\.(pdf|docx)$')
    or target_original_filename is null or length(target_original_filename) not between 1 and 255
    or target_mime_type not in ('application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    or target_size_bytes not between 1 and 10485760
    or target_content_sha256 is null or target_content_sha256 !~ '^[0-9a-f]{64}$'
    or target_page_count is not null and target_page_count not between 1 and 80
    or target_extracted_character_count not between 1 and 100000
  then raise exception 'invalid_resume_version' using errcode = '22023'; end if;

  select * into existing_version from public.resume_versions
  where user_id = actor_user_id and content_sha256 = target_content_sha256;
  if found then
    return query select existing_version.document_id, existing_version.id, existing_version.version_number;
    return;
  end if;

  if resolved_document_id is null then
    if target_document_kind = 'master' and exists (
      select 1 from public.resume_documents
      where user_id = actor_user_id and document_kind = 'master' and archived_at is null
    ) then raise exception 'master_resume_already_exists' using errcode = '23505'; end if;
    insert into public.resume_documents (user_id, label, document_kind)
    values (actor_user_id, btrim(target_label), target_document_kind)
    returning id into resolved_document_id;
    next_version := 1;
  else
    perform 1 from public.resume_documents
    where id = resolved_document_id and user_id = actor_user_id
      and document_kind = target_document_kind and archived_at is null
    for update;
    if not found then raise exception 'resume_document_not_found' using errcode = '22023'; end if;
    select coalesce(max(rv.version_number), 0) + 1 into next_version
    from public.resume_versions rv where rv.document_id = resolved_document_id;
  end if;

  if target_source_version_id is not null and not exists (
    select 1 from public.resume_versions
    where id = target_source_version_id and user_id = actor_user_id
  ) then raise exception 'source_resume_version_not_found' using errcode = '22023'; end if;

  insert into public.resume_versions (
    id, user_id, document_id, version_number, storage_path, original_filename,
    mime_type, size_bytes, content_sha256, page_count,
    extracted_character_count, source_version_id
  ) values (
    target_version_id, actor_user_id, resolved_document_id, next_version,
    target_storage_path, target_original_filename, target_mime_type,
    target_size_bytes, target_content_sha256, target_page_count,
    target_extracted_character_count, target_source_version_id
  );

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state, permission_decision, outcome
  ) values (
    actor_user_id, 'user', 'resume.version_created', 'resume_version', target_version_id::text,
    jsonb_build_object('documentId', resolved_document_id, 'versionNumber', next_version,
      'documentKind', target_document_kind, 'mimeType', target_mime_type,
      'sizeBytes', target_size_bytes, 'sha256', target_content_sha256),
    jsonb_build_object('capability', 'files.upload'), 'succeeded'
  );
  return query select resolved_document_id, target_version_id, next_version;
end;
$$;
