-- Issue #15 (D29): AI drafts for cover letters and application Q&A.
-- * New analysis kind application_pack, gated by ai.material_draft (which already depends on
--   ai.master), with the same monthly HK$100 reservation, fingerprint cache and store=false call.
-- * application_drafts: editable fields with evidence. AI output fills only unlocked fields; any
--   field the user has edited is locked and never overwritten by regeneration.
-- * Nothing here submits, sends or fills a form (AGENTS.md section 5).
-- * Fix: complete_ai_analysis wrote audit actor_type 'automation', which audit_events rejects
--   (allowed: user / ai / sync / scheduler / system / recovery), so every AI completion failed.
--   The redefinition below records actor_type 'ai'; this also repairs resume and JD analysis.

alter table public.ai_usage_events drop constraint ai_usage_events_analysis_kind_check;
alter table public.ai_usage_events add constraint ai_usage_events_analysis_kind_check
  check (analysis_kind in ('resume', 'jd_match', 'application_pack'));
alter table public.ai_analyses drop constraint ai_analyses_analysis_kind_check;
alter table public.ai_analyses add constraint ai_analyses_analysis_kind_check
  check (analysis_kind in ('resume', 'jd_match', 'application_pack'));
alter table public.ai_analyses drop constraint ai_analysis_context;
alter table public.ai_analyses add constraint ai_analysis_context check (
  (analysis_kind = 'resume' and opportunity_id is null)
  or (analysis_kind in ('jd_match', 'application_pack') and opportunity_id is not null)
);

insert into public.capability_dependencies (capability_key, required_capability_key)
select 'ai.material_draft', 'ai.analysis'
where not exists (
  select 1 from public.capability_dependencies
  where capability_key = 'ai.material_draft' and required_capability_key = 'ai.analysis'
);

create or replace function private.reserve_ai_usage(
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
  if target_analysis_kind not in ('resume', 'jd_match', 'application_pack')
    or target_input_fingerprint !~ '^[0-9a-f]{64}$'
    or target_reserve_hkd_cents not between 1 and 10000
  then raise exception 'invalid_ai_reservation' using errcode = '22023'; end if;
  required_capability := case target_analysis_kind when 'resume' then 'ai.resume_analysis'
    when 'application_pack' then 'ai.material_draft' else 'ai.jd_analysis' end;
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

create or replace function private.complete_ai_analysis(
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
  if usage.analysis_kind in ('jd_match', 'application_pack') and not exists (
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
    actor_user_id, 'ai', 'ai.analysis_completed', 'ai_analysis', analysis_id::text,
    jsonb_build_object('analysisKind', usage.analysis_kind, 'model', target_model,
      'promptVersion', target_prompt_version, 'inputFingerprint', usage.input_fingerprint,
      'actualHkdCents', target_actual_hkd_cents),
    jsonb_build_object('capability', case usage.analysis_kind when 'resume' then 'ai.resume_analysis'
      when 'application_pack' then 'ai.material_draft' else 'ai.jd_analysis' end), 'succeeded'
  );
  return analysis_id;
end;
$$;


create table public.application_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  field_key text not null check (field_key ~ '^(cover_letter|tailoring_points|gap_explanation|qa_[1-5])$'),
  question text check (question is null or length(question) between 1 and 500),
  body text not null default '' check (length(body) <= 8000),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array' and pg_column_size(evidence) <= 32768),
  missing_info jsonb not null default '[]'::jsonb check (jsonb_typeof(missing_info) = 'array' and pg_column_size(missing_info) <= 8192),
  needs_confirmation boolean not null default false,
  source text not null check (source in ('ai', 'user')),
  locked boolean not null default false,
  ai_analysis_id uuid references public.ai_analyses(id) on delete set null,
  prompt_version text check (prompt_version is null or length(prompt_version) between 1 and 80),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (opportunity_id, field_key),
  constraint application_draft_question_shape check ((field_key like 'qa_%') = (question is not null)),
  constraint application_draft_user_locked check (source = 'ai' or locked)
);
create index application_drafts_user_idx on public.application_drafts (user_id, opportunity_id);
create index application_drafts_analysis_idx on public.application_drafts (ai_analysis_id) where ai_analysis_id is not null;
create trigger application_drafts_set_updated_at before update on public.application_drafts
  for each row execute function private.set_updated_at();

alter table public.application_drafts enable row level security;
create policy application_drafts_select_own on public.application_drafts for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.application_drafts from public, anon, authenticated;
grant select on table public.application_drafts to authenticated;
grant select, insert, update, delete on table public.application_drafts to service_role;

-- The owner's own stored resume text (D30), used as the only resume input to the draft call.
create function private.read_resume_text_impl(target_version_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  stored text;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select t.body into stored from private.resume_version_texts t
  where t.resume_version_id = target_version_id and t.user_id = actor_user_id;
  return stored;
end;
$$;

create function public.read_my_resume_text(target_version_id uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return private.read_resume_text_impl(target_version_id);
end;
$$;

-- Copy a completed application_pack analysis into the draft fields, skipping locked ones.
-- Expected result shape (validated by the strict JSON schema in the web app):
--   { coverLetter: {text, confidence, evidence[], missingInfo[]}, gapExplanation: {...},
--     tailoringPoints: {...}, answers: [{question, text, confidence, evidence[], missingInfo[]}] }
create function private.apply_application_pack_impl(target_analysis_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  analysis public.ai_analyses%rowtype;
  field record;
  written integer := 0;
  changed integer;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into analysis from public.ai_analyses a
  where a.id = target_analysis_id and a.user_id = actor_user_id and a.analysis_kind = 'application_pack';
  if analysis.id is null then raise exception 'analysis_not_found' using errcode = 'P0002'; end if;

  for field in
    select f.field_key, f.question, f.payload from (
      select 'cover_letter'::text as field_key, null::text as question, analysis.result -> 'coverLetter' as payload
      union all select 'gap_explanation', null, analysis.result -> 'gapExplanation'
      union all select 'tailoring_points', null, analysis.result -> 'tailoringPoints'
      union all
      select 'qa_' || a.ordinality, left(nullif(btrim(a.value ->> 'question'), ''), 500), a.value
      from jsonb_array_elements(coalesce(analysis.result -> 'answers', '[]'::jsonb)) with ordinality as a(value, ordinality)
      where a.ordinality <= 5
    ) f
    where jsonb_typeof(f.payload) = 'object' and (f.field_key not like 'qa_%' or f.question is not null)
  loop
    insert into public.application_drafts (
      user_id, opportunity_id, field_key, question, body, evidence, missing_info, needs_confirmation,
      source, locked, ai_analysis_id, prompt_version
    ) values (
      actor_user_id, analysis.opportunity_id, field.field_key, field.question,
      left(coalesce(field.payload ->> 'text', ''), 8000),
      case when jsonb_typeof(field.payload -> 'evidence') = 'array' then field.payload -> 'evidence' else '[]'::jsonb end,
      case when jsonb_typeof(field.payload -> 'missingInfo') = 'array' then field.payload -> 'missingInfo' else '[]'::jsonb end,
      coalesce(field.payload ->> 'confidence', 'low') <> 'high'
        or jsonb_array_length(case when jsonb_typeof(field.payload -> 'missingInfo') = 'array' then field.payload -> 'missingInfo' else '[]'::jsonb end) > 0
        or jsonb_array_length(case when jsonb_typeof(field.payload -> 'evidence') = 'array' then field.payload -> 'evidence' else '[]'::jsonb end) = 0,
      'ai', false, analysis.id, analysis.prompt_version
    )
    on conflict (opportunity_id, field_key) do update set
      question = excluded.question, body = excluded.body, evidence = excluded.evidence,
      missing_info = excluded.missing_info, needs_confirmation = excluded.needs_confirmation,
      source = 'ai', ai_analysis_id = excluded.ai_analysis_id, prompt_version = excluded.prompt_version,
      version = public.application_drafts.version + 1
    where not public.application_drafts.locked;
    get diagnostics changed = row_count;
    written := written + changed;
  end loop;

  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, after_state, permission_decision, outcome)
  values (actor_user_id, 'user', 'application_drafts.apply_ai', 'opportunity', analysis.opportunity_id::text,
    jsonb_build_object('analysisId', analysis.id, 'fieldsWritten', written, 'promptVersion', analysis.prompt_version),
    jsonb_build_object('capability', 'ai.material_draft', 'externalAction', false, 'lockedFieldsPreserved', true), 'succeeded');
  return written;
end;
$$;

create function public.apply_my_application_pack(target_analysis_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.apply_application_pack_impl(target_analysis_id);
end;
$$;

-- User edits (or hand-written drafts with no AI at all). Saving locks the field.
create function private.save_draft_impl(
  target_opportunity_id uuid, target_field_key text, target_question text, target_body text, target_base_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  existing public.application_drafts%rowtype;
  next_version bigint;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_field_key !~ '^(cover_letter|tailoring_points|gap_explanation|qa_[1-5])$'
    or target_body is null or length(target_body) > 8000
    or ((target_field_key like 'qa_%') <> (nullif(btrim(coalesce(target_question, '')), '') is not null))
    or length(coalesce(target_question, '')) > 500 then
    raise exception 'invalid_draft' using errcode = '22023';
  end if;
  if not exists (select 1 from public.opportunities o where o.id = target_opportunity_id and o.user_id = actor_user_id) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select * into existing from public.application_drafts d
  where d.opportunity_id = target_opportunity_id and d.field_key = target_field_key and d.user_id = actor_user_id
  for update;
  if existing.id is null then
    insert into public.application_drafts (user_id, opportunity_id, field_key, question, body, source, locked)
    values (actor_user_id, target_opportunity_id, target_field_key, nullif(btrim(coalesce(target_question, '')), ''), target_body, 'user', true)
    returning version into next_version;
  else
    if target_base_version is distinct from existing.version then
      raise exception 'draft_version_conflict' using errcode = '40001';
    end if;
    update public.application_drafts set
      body = target_body, question = coalesce(nullif(btrim(coalesce(target_question, '')), ''), question),
      source = 'user', locked = true, needs_confirmation = false, version = version + 1
    where id = existing.id
    returning version into next_version;
  end if;
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, after_state, permission_decision, outcome)
  values (actor_user_id, 'user', 'application_drafts.edit', 'opportunity', target_opportunity_id::text,
    jsonb_build_object('field', target_field_key, 'version', next_version, 'locked', true),
    jsonb_build_object('source', 'user_edit', 'externalAction', false), 'succeeded');
  return next_version;
end;
$$;

create function public.save_my_application_draft(
  target_opportunity_id uuid, target_field_key text, target_question text, target_body text, target_base_version bigint
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.save_draft_impl(target_opportunity_id, target_field_key, target_question, target_body, target_base_version);
end;
$$;

-- Explicitly allow the next AI generation to replace a field the user had edited.
create function private.unlock_draft_impl(target_draft_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  update public.application_drafts set locked = false, source = 'ai', version = version + 1
  where id = target_draft_id and user_id = actor_user_id and locked and ai_analysis_id is not null;
  if not found then raise exception 'draft_not_unlockable' using errcode = '23514'; end if;
end;
$$;

create function public.unlock_my_application_draft(target_draft_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform private.unlock_draft_impl(target_draft_id);
end;
$$;

revoke all on function private.read_resume_text_impl(uuid) from public, anon;
grant execute on function private.read_resume_text_impl(uuid) to authenticated, service_role;
revoke all on function private.apply_application_pack_impl(uuid) from public, anon;
grant execute on function private.apply_application_pack_impl(uuid) to authenticated, service_role;
revoke all on function private.save_draft_impl(uuid, text, text, text, bigint) from public, anon;
grant execute on function private.save_draft_impl(uuid, text, text, text, bigint) to authenticated, service_role;
revoke all on function private.unlock_draft_impl(uuid) from public, anon;
grant execute on function private.unlock_draft_impl(uuid) to authenticated, service_role;
revoke all on function public.read_my_resume_text(uuid) from public, anon;
grant execute on function public.read_my_resume_text(uuid) to authenticated, service_role;
revoke all on function public.apply_my_application_pack(uuid) from public, anon;
grant execute on function public.apply_my_application_pack(uuid) to authenticated, service_role;
revoke all on function public.save_my_application_draft(uuid, text, text, text, bigint) from public, anon;
grant execute on function public.save_my_application_draft(uuid, text, text, text, bigint) to authenticated, service_role;
revoke all on function public.unlock_my_application_draft(uuid) from public, anon;
grant execute on function public.unlock_my_application_draft(uuid) to authenticated, service_role;
