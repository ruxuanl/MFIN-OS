-- Resume library and AI analysis foundation approved by D07/D08.
-- Files remain private; resume versions and AI results are append-only.

insert into public.capability_definitions (
  capability_key, category, label, description, risk_level,
  requires_ai, supports_once, supports_timed, connection_provider, requires_reverification
) values
  ('ai.resume_analysis', 'ai', '简历分析', '把用户选中的简历发送给 AI，分析内容、结构和可读性。', 'high', true, true, true, null, false),
  ('ai.jd_analysis', 'ai', 'JD 匹配分析', '把选中的 JD 和简历发送给 AI，生成匹配、紧急度与投递建议。', 'high', true, true, true, null, false)
on conflict (capability_key) do update set
  label = excluded.label,
  description = excluded.description,
  risk_level = excluded.risk_level,
  requires_ai = excluded.requires_ai,
  supports_once = excluded.supports_once,
  supports_timed = excluded.supports_timed;

insert into public.capability_dependencies (capability_key, required_capability_key) values
  ('ai.resume_analysis', 'ai.analysis'),
  ('ai.resume_analysis', 'files.upload'),
  ('ai.jd_analysis', 'ai.analysis'),
  ('ai.jd_analysis', 'ai.recommendation'),
  ('ai.jd_analysis', 'ai.material_draft')
on conflict do nothing;

create table public.resume_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null check (length(label) between 1 and 160),
  document_kind text not null check (document_kind in ('master', 'tailored')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index resume_documents_one_master_idx
  on public.resume_documents (user_id)
  where document_kind = 'master' and archived_at is null;

create table public.resume_versions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.resume_documents(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_path text not null unique check (length(storage_path) between 10 and 500),
  original_filename text not null check (length(original_filename) between 1 and 255),
  mime_type text not null check (mime_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count is null or page_count between 1 and 80),
  extracted_character_count integer not null check (extracted_character_count between 1 and 100000),
  source_version_id uuid references public.resume_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (user_id, content_sha256)
);

create index resume_versions_user_created_idx on public.resume_versions (user_id, created_at desc);
create index resume_versions_document_idx on public.resume_versions (document_id, version_number desc);
create index resume_versions_source_idx on public.resume_versions (source_version_id) where source_version_id is not null;

create table public.opportunity_resume_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions(id) on delete restrict,
  assignment_kind text not null check (assignment_kind in ('master_default', 'tailored')),
  is_current boolean not null default true,
  selected_at timestamptz not null default now(),
  superseded_at timestamptz,
  constraint opportunity_resume_assignment_state check (
    (is_current and superseded_at is null) or (not is_current and superseded_at is not null)
  )
);

create unique index opportunity_resume_assignments_current_idx
  on public.opportunity_resume_assignments (opportunity_id)
  where is_current;
create index opportunity_resume_assignments_version_idx
  on public.opportunity_resume_assignments (resume_version_id);

create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_kind text not null check (analysis_kind in ('resume', 'jd_match')),
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'failed', 'cancelled')),
  provider text not null default 'openai' check (provider = 'openai'),
  model text check (model is null or length(model) between 1 and 120),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  reserved_hkd_cents integer not null check (reserved_hkd_cents between 1 and 10000),
  actual_hkd_cents integer check (actual_hkd_cents is null or actual_hkd_cents between 0 and 10000),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  error_code text check (error_code is null or length(error_code) <= 120),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create index ai_usage_events_month_idx on public.ai_usage_events (user_id, created_at, status);

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  analysis_kind text not null check (analysis_kind in ('resume', 'jd_match')),
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions(id) on delete restrict,
  usage_event_id uuid not null unique references public.ai_usage_events(id) on delete restrict,
  provider text not null default 'openai' check (provider = 'openai'),
  model text not null check (length(model) between 1 and 120),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) <= 131072),
  created_at timestamptz not null default now(),
  constraint ai_analysis_context check (
    (analysis_kind = 'resume' and opportunity_id is null)
    or (analysis_kind = 'jd_match' and opportunity_id is not null)
  ),
  unique (user_id, analysis_kind, input_fingerprint, prompt_version)
);

create index ai_analyses_resume_idx on public.ai_analyses (resume_version_id, created_at desc);
create index ai_analyses_opportunity_idx on public.ai_analyses (opportunity_id, created_at desc)
  where opportunity_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resume-files', 'resume-files', false, 10485760,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.resume_documents enable row level security;
alter table public.resume_versions enable row level security;
alter table public.opportunity_resume_assignments enable row level security;
alter table public.ai_usage_events enable row level security;
alter table public.ai_analyses enable row level security;

create policy resume_documents_read_own on public.resume_documents
for select to authenticated using ((select auth.uid()) = user_id);
create policy resume_versions_read_own on public.resume_versions
for select to authenticated using ((select auth.uid()) = user_id);
create policy opportunity_resume_assignments_read_own on public.opportunity_resume_assignments
for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_usage_events_read_own on public.ai_usage_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_analyses_read_own on public.ai_analyses
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists resume_files_storage_read_own on storage.objects;
create policy resume_files_storage_read_own on storage.objects
for select to authenticated
using (
  bucket_id = 'resume-files'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.resume_versions rv
    where rv.user_id = (select auth.uid()) and rv.storage_path = storage.objects.name
  )
);

revoke all on public.resume_documents, public.resume_versions,
  public.opportunity_resume_assignments, public.ai_usage_events, public.ai_analyses
  from public, anon, authenticated;
grant select on public.resume_documents, public.resume_versions,
  public.opportunity_resume_assignments, public.ai_usage_events, public.ai_analyses
  to authenticated;
grant all on public.resume_documents, public.resume_versions,
  public.opportunity_resume_assignments, public.ai_usage_events, public.ai_analyses
  to service_role;

create function private.register_resume_version(
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
    or target_storage_path is null or target_storage_path !~ ('^' || actor_user_id::text || '/[0-9a-f-]{36}/resume\\.(pdf|docx)$')
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

create function public.register_my_resume_version(
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
language sql
security invoker
set search_path = ''
as $$
  select * from private.register_resume_version(
    target_version_id, target_document_id, target_label, target_document_kind,
    target_storage_path, target_original_filename, target_mime_type,
    target_size_bytes, target_content_sha256, target_page_count,
    target_extracted_character_count, target_source_version_id
  );
$$;

create function private.assign_opportunity_resume(
  target_opportunity_id uuid,
  target_resume_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  new_assignment_id uuid;
  target_kind text;
begin
  if actor_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not private.m3_writes_allowed(actor_user_id) then raise exception 'privacy_locked' using errcode = '42501'; end if;
  if not exists (select 1 from public.opportunities where id = target_opportunity_id and user_id = actor_user_id)
  then raise exception 'opportunity_not_found' using errcode = '22023'; end if;
  select rd.document_kind into target_kind
  from public.resume_versions rv join public.resume_documents rd on rd.id = rv.document_id
  where rv.id = target_resume_version_id and rv.user_id = actor_user_id;
  if target_kind is null then raise exception 'resume_version_not_found' using errcode = '22023'; end if;

  update public.opportunity_resume_assignments
  set is_current = false, superseded_at = now()
  where opportunity_id = target_opportunity_id and user_id = actor_user_id and is_current;
  insert into public.opportunity_resume_assignments (
    user_id, opportunity_id, resume_version_id, assignment_kind
  ) values (
    actor_user_id, target_opportunity_id, target_resume_version_id,
    case when target_kind = 'master' then 'master_default' else 'tailored' end
  ) returning id into new_assignment_id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    actor_user_id, 'opportunity', target_opportunity_id, 'resume_version_selected', 'user',
    '用户选择了该岗位使用的简历版本',
    jsonb_build_object('resumeVersionId', target_resume_version_id,
      'assignmentKind', case when target_kind = 'master' then 'master_default' else 'tailored' end)
  );
  return new_assignment_id;
end;
$$;

create function public.assign_my_opportunity_resume(
  target_opportunity_id uuid,
  target_resume_version_id uuid
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.assign_opportunity_resume(target_opportunity_id, target_resume_version_id); $$;

create function private.reserve_ai_usage(
  target_analysis_kind text,
  target_input_fingerprint text,
  target_reserve_hkd_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  usage_id uuid;
  month_start timestamptz := date_trunc('month', now() at time zone 'Asia/Hong_Kong') at time zone 'Asia/Hong_Kong';
  spent_and_reserved integer;
  required_capability text;
begin
  if actor_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not private.m3_writes_allowed(actor_user_id) then raise exception 'privacy_locked' using errcode = '42501'; end if;
  if target_analysis_kind not in ('resume', 'jd_match')
    or target_input_fingerprint !~ '^[0-9a-f]{64}$'
    or target_reserve_hkd_cents not between 1 and 10000
  then raise exception 'invalid_ai_reservation' using errcode = '22023'; end if;
  required_capability := case when target_analysis_kind = 'resume' then 'ai.resume_analysis' else 'ai.jd_analysis' end;
  if not exists (
    select 1 from private.evaluate_permission(actor_user_id, required_capability, null) where allowed
  ) then raise exception 'ai_permission_denied' using errcode = '42501'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_user_id::text || ':ai_budget', 0));
  select coalesce(sum(case when status = 'completed' then actual_hkd_cents else reserved_hkd_cents end), 0)::integer
  into spent_and_reserved
  from public.ai_usage_events
  where user_id = actor_user_id and created_at >= month_start and status in ('reserved', 'completed');
  if spent_and_reserved + target_reserve_hkd_cents > 10000
  then raise exception 'ai_monthly_budget_exceeded' using errcode = 'P0001'; end if;

  insert into public.ai_usage_events (
    user_id, analysis_kind, input_fingerprint, reserved_hkd_cents
  ) values (
    actor_user_id, target_analysis_kind, target_input_fingerprint, target_reserve_hkd_cents
  ) returning id into usage_id;
  return usage_id;
end;
$$;

create function public.reserve_my_ai_usage(
  target_analysis_kind text,
  target_input_fingerprint text,
  target_reserve_hkd_cents integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select private.reserve_ai_usage(target_analysis_kind, target_input_fingerprint, target_reserve_hkd_cents); $$;

create function private.complete_ai_analysis(
  target_usage_event_id uuid,
  target_opportunity_id uuid,
  target_resume_version_id uuid,
  target_model text,
  target_prompt_version text,
  target_result jsonb,
  target_input_tokens integer,
  target_output_tokens integer,
  target_actual_hkd_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  usage public.ai_usage_events%rowtype;
  analysis_id uuid;
begin
  if actor_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  select * into usage from public.ai_usage_events
  where id = target_usage_event_id and user_id = actor_user_id for update;
  if not found or usage.status <> 'reserved' then
    raise exception 'ai_usage_reservation_not_found' using errcode = '22023';
  end if;
  if target_model is null or length(target_model) not between 1 and 120
    or target_prompt_version is null or length(target_prompt_version) not between 1 and 80
    or target_result is null or jsonb_typeof(target_result) <> 'object' or pg_column_size(target_result) > 131072
    or target_input_tokens < 0 or target_output_tokens < 0
    or target_actual_hkd_cents not between 0 and usage.reserved_hkd_cents
  then raise exception 'invalid_ai_analysis_result' using errcode = '22023'; end if;
  if not exists (
    select 1 from public.resume_versions
    where id = target_resume_version_id and user_id = actor_user_id
  ) then raise exception 'resume_version_not_found' using errcode = '22023'; end if;
  if usage.analysis_kind = 'jd_match' and not exists (
    select 1 from public.opportunities
    where id = target_opportunity_id and user_id = actor_user_id
  ) then raise exception 'opportunity_not_found' using errcode = '22023'; end if;
  if usage.analysis_kind = 'resume' then target_opportunity_id := null; end if;

  insert into public.ai_analyses (
    user_id, analysis_kind, opportunity_id, resume_version_id, usage_event_id,
    model, prompt_version, input_fingerprint, result
  ) values (
    actor_user_id, usage.analysis_kind, target_opportunity_id, target_resume_version_id,
    usage.id, target_model, target_prompt_version, usage.input_fingerprint, target_result
  )
  on conflict (user_id, analysis_kind, input_fingerprint, prompt_version)
  do update set result = excluded.result
  returning id into analysis_id;

  update public.ai_usage_events set
    status = 'completed', model = target_model, actual_hkd_cents = target_actual_hkd_cents,
    input_tokens = target_input_tokens, output_tokens = target_output_tokens,
    finished_at = now()
  where id = usage.id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state,
    permission_decision, outcome
  ) values (
    actor_user_id, 'automation', 'ai.analysis_completed', 'ai_analysis', analysis_id::text,
    jsonb_build_object('analysisKind', usage.analysis_kind, 'model', target_model,
      'promptVersion', target_prompt_version, 'inputFingerprint', usage.input_fingerprint,
      'actualHkdCents', target_actual_hkd_cents),
    jsonb_build_object('capability', case when usage.analysis_kind = 'resume'
      then 'ai.resume_analysis' else 'ai.jd_analysis' end), 'succeeded'
  );
  return analysis_id;
end;
$$;

create function public.complete_my_ai_analysis(
  target_usage_event_id uuid,
  target_opportunity_id uuid,
  target_resume_version_id uuid,
  target_model text,
  target_prompt_version text,
  target_result jsonb,
  target_input_tokens integer,
  target_output_tokens integer,
  target_actual_hkd_cents integer
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.complete_ai_analysis(
    target_usage_event_id, target_opportunity_id, target_resume_version_id,
    target_model, target_prompt_version, target_result, target_input_tokens,
    target_output_tokens, target_actual_hkd_cents
  );
$$;

create function private.fail_ai_usage(target_usage_event_id uuid, target_error_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if target_error_code is null or length(target_error_code) not between 1 and 120
  then raise exception 'invalid_ai_error_code' using errcode = '22023'; end if;
  update public.ai_usage_events set
    status = 'failed', error_code = target_error_code, finished_at = now()
  where id = target_usage_event_id and user_id = actor_user_id and status = 'reserved';
end;
$$;

create function public.fail_my_ai_usage(target_usage_event_id uuid, target_error_code text)
returns void
language sql
security invoker
set search_path = ''
as $$ select private.fail_ai_usage(target_usage_event_id, target_error_code); $$;

revoke execute on function private.register_resume_version(uuid, uuid, text, text, text, text, text, integer, text, integer, integer, uuid) from public, anon;
revoke execute on function private.assign_opportunity_resume(uuid, uuid) from public, anon;
revoke execute on function private.reserve_ai_usage(text, text, integer) from public, anon;
grant execute on function private.register_resume_version(uuid, uuid, text, text, text, text, text, integer, text, integer, integer, uuid) to authenticated, service_role;
grant execute on function private.assign_opportunity_resume(uuid, uuid) to authenticated, service_role;
grant execute on function private.reserve_ai_usage(text, text, integer) to authenticated, service_role;
revoke execute on function private.complete_ai_analysis(uuid, uuid, uuid, text, text, jsonb, integer, integer, integer) from public, anon;
revoke execute on function private.fail_ai_usage(uuid, text) from public, anon;
grant execute on function private.complete_ai_analysis(uuid, uuid, uuid, text, text, jsonb, integer, integer, integer) to authenticated, service_role;
grant execute on function private.fail_ai_usage(uuid, text) to authenticated, service_role;

revoke execute on function public.register_my_resume_version(uuid, uuid, text, text, text, text, text, integer, text, integer, integer, uuid) from public, anon;
revoke execute on function public.assign_my_opportunity_resume(uuid, uuid) from public, anon;
revoke execute on function public.reserve_my_ai_usage(text, text, integer) from public, anon;
grant execute on function public.register_my_resume_version(uuid, uuid, text, text, text, text, text, integer, text, integer, integer, uuid) to authenticated, service_role;
grant execute on function public.assign_my_opportunity_resume(uuid, uuid) to authenticated, service_role;
grant execute on function public.reserve_my_ai_usage(text, text, integer) to authenticated, service_role;
revoke execute on function public.complete_my_ai_analysis(uuid, uuid, uuid, text, text, jsonb, integer, integer, integer) from public, anon;
revoke execute on function public.fail_my_ai_usage(uuid, text) from public, anon;
grant execute on function public.complete_my_ai_analysis(uuid, uuid, uuid, text, text, jsonb, integer, integer, integer) to authenticated, service_role;
grant execute on function public.fail_my_ai_usage(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
