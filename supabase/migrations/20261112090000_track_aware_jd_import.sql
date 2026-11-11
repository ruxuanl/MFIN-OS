-- Issue #11: pasted-JD quick capture for both tracks (internship and graduate).
-- Adds a track-aware RPC alongside the original internship-only one, which stays
-- unchanged for compatibility. Same bounds, idempotency, timeline and audit; the
-- function is SECURITY INVOKER, owner-scoped through RLS, and performs no
-- application, message or external write.

create function public.import_my_jd(
  target_track text,
  target_company text,
  target_role_title text,
  target_department text,
  target_location text,
  target_deadline date,
  target_posted_on date,
  target_source_url text,
  target_raw_jd text,
  target_responsibilities text,
  target_requirements text,
  target_application_method text,
  target_parser_version text,
  target_extraction_confidence numeric,
  target_extraction_gaps text[],
  target_jd_fingerprint text,
  target_stage text,
  target_applied_at timestamptz
)
returns table(opportunity_id uuid, created boolean, opportunity_track text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  new_candidate_id uuid;
  new_opportunity_id uuid;
  existing_opportunity_id uuid;
  existing_track text;
  normalized_gaps text[] := coalesce(target_extraction_gaps, '{}'::text[]);
  normalized_summary text;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_track is null or target_track not in ('internship', 'graduate')
    or target_company is null or length(btrim(target_company)) not between 1 and 240
    or target_role_title is null or length(btrim(target_role_title)) not between 1 and 240
    or target_department is not null and length(target_department) > 240
    or target_location is not null and length(target_location) > 240
    or target_source_url is not null and (length(target_source_url) > 2048 or target_source_url !~ '^https://')
    or target_raw_jd is null or length(target_raw_jd) not between 20 and 50000
    or target_responsibilities is not null and length(target_responsibilities) > 20000
    or target_requirements is not null and length(target_requirements) > 20000
    or target_application_method is not null and length(target_application_method) > 4000
    or target_parser_version is null or length(target_parser_version) not between 1 and 80
    or target_extraction_confidence is null or target_extraction_confidence not between 0 and 1
    or target_jd_fingerprint is null or target_jd_fingerprint !~ '^[0-9a-f]{64}$'
    or target_stage not in ('evaluation', 'preparation', 'submitted')
    or exists (select 1 from unnest(normalized_gaps) as gap where length(gap) not between 1 and 120)
  then
    raise exception 'invalid_jd_import' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':' || target_jd_fingerprint, 0)
  );

  -- The fingerprint is unique per user across both tracks: a JD already filed
  -- under either track returns that record instead of creating a second one.
  select candidate.promoted_opportunity_id, candidate.track
  into existing_opportunity_id, existing_track
  from public.opportunity_candidates as candidate
  where candidate.user_id = actor_user_id
    and candidate.jd_fingerprint = target_jd_fingerprint;

  if existing_opportunity_id is not null then
    return query select existing_opportunity_id, false, existing_track;
    return;
  end if;

  normalized_summary := left(
    pg_catalog.regexp_replace(target_raw_jd, E'[\\n\\r\\t ]+', ' ', 'g'),
    1000
  );

  insert into public.opportunity_candidates (
    user_id, track, company, department, role_title, location, work_mode,
    deadline, posted_on, source_summary, source_url, decision_status,
    jd_fingerprint, last_verified_at
  ) values (
    actor_user_id, target_track, btrim(target_company), nullif(btrim(target_department), ''),
    btrim(target_role_title), nullif(btrim(target_location), ''), 'unspecified',
    target_deadline, target_posted_on, normalized_summary, target_source_url,
    'candidate', target_jd_fingerprint, now()
  ) returning id into new_candidate_id;

  insert into public.opportunities (
    user_id, candidate_id, track, intent, company, department, role_title,
    location, work_mode, deadline, posted_on, source_summary, source_url,
    main_stage, applied_at, waiting_on, raw_jd, responsibilities, requirements,
    application_method, parser_version, extraction_confidence, extraction_gaps
  ) values (
    actor_user_id, new_candidate_id, target_track,
    case when target_stage = 'evaluation' then 'track' else 'apply' end,
    btrim(target_company), nullif(btrim(target_department), ''), btrim(target_role_title),
    nullif(btrim(target_location), ''), 'unspecified', target_deadline,
    target_posted_on, normalized_summary, target_source_url, target_stage,
    case when target_stage = 'submitted' then coalesce(target_applied_at, now()) else null end,
    case when target_stage = 'submitted' then 'other_party' else 'user' end,
    target_raw_jd, nullif(btrim(target_responsibilities), ''),
    nullif(btrim(target_requirements), ''), nullif(btrim(target_application_method), ''),
    target_parser_version, target_extraction_confidence, normalized_gaps
  ) returning id into new_opportunity_id;

  update public.opportunity_candidates
  set decision_status = 'promoted', promoted_opportunity_id = new_opportunity_id,
      version = version + 1
  where id = new_candidate_id and user_id = actor_user_id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    actor_user_id, 'opportunity', new_opportunity_id, 'jd_imported', 'user',
    case when target_track = 'internship' then '用户粘贴 JD 并确认建立实习记录' else '用户粘贴 JD 并确认建立秋招记录' end,
    jsonb_build_object(
      'parserVersion', target_parser_version,
      'confidence', target_extraction_confidence,
      'gaps', to_jsonb(normalized_gaps),
      'fingerprint', target_jd_fingerprint,
      'postedOn', target_posted_on,
      'stage', target_stage
    )
  );

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, after_state,
    permission_decision, outcome
  ) values (
    actor_user_id, 'user', target_track || '.jd_import', 'opportunity', new_opportunity_id::text,
    jsonb_build_object(
      'candidateId', new_candidate_id,
      'track', target_track,
      'parserVersion', target_parser_version,
      'confidence', target_extraction_confidence,
      'gaps', to_jsonb(normalized_gaps),
      'fingerprint', target_jd_fingerprint,
      'postedOn', target_posted_on,
      'stage', target_stage
    ),
    jsonb_build_object('source', 'user_paste_confirmation'), 'succeeded'
  );

  return query select new_opportunity_id, true, target_track;
end;
$$;

revoke execute on function public.import_my_jd(
  text, text, text, text, text, date, date, text, text, text, text, text,
  text, numeric, text[], text, text, timestamptz
) from public, anon, authenticated;

grant execute on function public.import_my_jd(
  text, text, text, text, text, date, date, text, text, text, text, text,
  text, numeric, text[], text, text, timestamptz
) to authenticated, service_role;

notify pgrst, 'reload schema';
