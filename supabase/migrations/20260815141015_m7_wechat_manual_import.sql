-- M7 manual fallback, text/link slice. The user explicitly supplies a minimal
-- JD projection; no WeChat account, non-allowlisted chat, remote page, image,
-- attachment, or complete message history is read by the system.

alter table public.wechat_projections
  add column ingestion_mode text not null default 'monitor'
    check (ingestion_mode in ('monitor', 'manual')),
  add column source_url text
    check (source_url is null or length(source_url) <= 2048);

alter table public.wechat_projections
  alter column allowlist_group_id drop not null,
  drop constraint wechat_projections_rule_version_check,
  add constraint wechat_projections_rule_version_check
    check (rule_version in ('wechat_rules_v1', 'wechat_manual_v1')),
  add constraint wechat_projection_ingestion_shape check (
    (
      ingestion_mode = 'monitor'
      and allowlist_group_id is not null
      and rule_version = 'wechat_rules_v1'
      and source_url is null
    )
    or (
      ingestion_mode = 'manual'
      and allowlist_group_id is null
      and rule_version = 'wechat_manual_v1'
      and source_kind in ('text', 'link')
      and (
        (source_kind = 'text' and source_url is null)
        or (source_kind = 'link' and source_url ~ '^https://[^[:space:]]+$')
      )
    )
  );

create unique index wechat_projections_manual_capture_idx
  on public.wechat_projections (user_id, capture_key)
  where ingestion_mode = 'manual';

create or replace function private.create_my_wechat_manual_import(
  target_source_kind text,
  target_source_url text,
  target_track text,
  target_company text,
  target_role_title text,
  target_location text,
  target_deadline date,
  target_evidence_excerpt text,
  target_confirmed boolean
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
  actor_user_id uuid := auth.uid();
  decision record;
  normalized_source_kind text := lower(trim(coalesce(target_source_kind, '')));
  normalized_source_url text := nullif(trim(coalesce(target_source_url, '')), '');
  normalized_track text := lower(trim(coalesce(target_track, '')));
  normalized_company text := trim(regexp_replace(coalesce(target_company, ''), '[[:space:]]+', ' ', 'g'));
  normalized_role_title text := trim(regexp_replace(coalesce(target_role_title, ''), '[[:space:]]+', ' ', 'g'));
  normalized_location text := nullif(trim(regexp_replace(coalesce(target_location, ''), '[[:space:]]+', ' ', 'g')), '');
  normalized_excerpt text := trim(regexp_replace(coalesce(target_evidence_excerpt, ''), '[[:space:]]+', ' ', 'g'));
  normalized_confirmed boolean := coalesce(target_confirmed, false);
  payload_hash text;
  manual_capture_key text;
  new_evidence_id uuid;
  new_projection_id uuid;
  new_candidate_id uuid;
  new_inbox_id uuid;
  existing_projection public.wechat_projections%rowtype;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  select * into decision
  from private.evaluate_permission(actor_user_id, 'wechat.import', null);
  if not decision.allowed then
    raise exception 'wechat_import_permission_denied:%', decision.reason using errcode = '42501';
  end if;

  if normalized_source_kind not in ('text', 'link')
    or normalized_track not in ('internship', 'graduate')
    or length(normalized_company) not between 1 and 240
    or length(normalized_role_title) not between 1 and 240
    or (normalized_location is not null and length(normalized_location) > 240)
    or length(normalized_excerpt) not between 1 and 1000
  then
    raise exception 'invalid_wechat_manual_import' using errcode = '22023';
  end if;

  if normalized_source_kind = 'text' then
    normalized_source_url := null;
  elsif normalized_source_url is null
    or length(normalized_source_url) > 2048
    or normalized_source_url !~ '^https://[^[:space:]]+$'
  then
    raise exception 'invalid_wechat_manual_link' using errcode = '22023';
  end if;

  payload_hash := encode(extensions.digest(convert_to(
    concat_ws(E'\n', normalized_source_kind, coalesce(normalized_source_url, ''),
      normalized_track, lower(normalized_company), lower(normalized_role_title),
      lower(coalesce(normalized_location, '')), coalesce(target_deadline::text, ''),
      normalized_excerpt),
    'UTF8'
  ), 'sha256'), 'hex');
  manual_capture_key := 'manual:' || payload_hash;

  select * into existing_projection
  from public.wechat_projections
  where user_id = actor_user_id
    and ingestion_mode = 'manual'
    and capture_key = manual_capture_key;
  if found then
    return query select existing_projection.id, existing_projection.inbox_item_id,
      existing_projection.candidate_id, false;
    return;
  end if;

  insert into public.evidence_refs (
    user_id, source_type, source_locator, content_hash, summary, last_verified_at
  ) values (
    actor_user_id, 'wechat_manual',
    coalesce(normalized_source_url, 'wechat-manual:text'),
    payload_hash, normalized_excerpt, now()
  ) returning id into new_evidence_id;

  insert into public.wechat_projections (
    user_id, allowlist_group_id, capture_key, content_hash, captured_at,
    source_kind, track, company, role_title, location, deadline,
    evidence_excerpt, confidence, rule_version, processing_status,
    evidence_id, candidate_id, ingestion_mode, source_url
  ) values (
    actor_user_id, null, manual_capture_key, payload_hash, now(),
    normalized_source_kind, normalized_track, normalized_company,
    normalized_role_title, normalized_location, target_deadline,
    normalized_excerpt, case when normalized_confirmed then 1 else 0.5 end,
    'wechat_manual_v1', 'pending', new_evidence_id, null, 'manual',
    normalized_source_url
  ) on conflict (user_id, capture_key) where ingestion_mode = 'manual'
    do nothing
  returning id into new_projection_id;

  if new_projection_id is null then
    delete from public.evidence_refs where id = new_evidence_id;
    select * into existing_projection
    from public.wechat_projections
    where user_id = actor_user_id
      and ingestion_mode = 'manual'
      and capture_key = manual_capture_key;
    return query select existing_projection.id, existing_projection.inbox_item_id,
      existing_projection.candidate_id, false;
    return;
  end if;

  if normalized_confirmed then
    insert into public.opportunity_candidates (
      user_id, track, company, role_title, location, deadline,
      source_summary, source_url, discovered_at, last_verified_at
    ) values (
      actor_user_id, normalized_track, normalized_company, normalized_role_title,
      normalized_location, target_deadline, normalized_excerpt,
      normalized_source_url, now(), now()
    ) returning id into new_candidate_id;

    update public.wechat_projections
    set processing_status = 'candidate', candidate_id = new_candidate_id
    where id = new_projection_id;
  end if;

  insert into public.inbox_items (
    user_id, gmail_message_id, wechat_projection_id, item_type, classification,
    title, summary, confidence, status, evidence_id, resolved_at
  ) values (
    actor_user_id, null, new_projection_id,
    case when normalized_confirmed then 'wechat_candidate' else 'wechat_pending' end,
    case when normalized_confirmed then 'job' else 'pending' end,
    normalized_company || '｜' || normalized_role_title, normalized_excerpt,
    case when normalized_confirmed then 1 else 0.5 end,
    case when normalized_confirmed then 'accepted' else 'pending' end,
    new_evidence_id, case when normalized_confirmed then now() else null end
  ) returning id into new_inbox_id;

  update public.wechat_projections
  set inbox_item_id = new_inbox_id
  where id = new_projection_id;

  if new_candidate_id is not null then
    insert into public.timeline_entries (
      user_id, entity_type, entity_id, event_type, actor_type, summary, changes
    ) values (
      actor_user_id, 'candidate', new_candidate_id, 'wechat.manual_imported', 'user',
      '用户确认手动导入微信候选岗位',
      jsonb_build_object('projection_id', new_projection_id, 'rule_version', 'wechat_manual_v1')
    );
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, rule_version, confidence, outcome
  ) values (
    actor_user_id, 'user', 'wechat.manual_imported', 'wechat_projection',
    new_projection_id::text,
    jsonb_build_object('processing_status', case when normalized_confirmed then 'candidate' else 'pending' end,
      'candidate_id', new_candidate_id, 'source_kind', normalized_source_kind),
    jsonb_build_object('allowed', true, 'grant_id', decision.grant_id),
    'wechat_manual_v1', case when normalized_confirmed then 1 else 0.5 end,
    'succeeded'
  );

  return query select new_projection_id, new_inbox_id, new_candidate_id, true;
end;
$$;

-- The M6 invoker implementation cannot promote a pending WeChat projection
-- because browser roles intentionally have SELECT-only access. Move the full
-- operation behind a private definer and retain a minimal invoker API wrapper.
alter function public.resolve_my_inbox_item(uuid, text) set schema private;

create or replace function private.resolve_my_inbox_item(
  target_item_id uuid,
  target_resolution text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  item_record public.inbox_items%rowtype;
  projection_record public.wechat_projections%rowtype;
  new_action_id uuid;
  new_candidate_id uuid;
  audit_namespace text;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if target_resolution not in ('accept', 'dismiss') then
    raise exception 'invalid_inbox_resolution' using errcode = '22023';
  end if;
  if exists (select 1 from public.privacy_locks where user_id = actor_user_id and is_locked) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  select * into item_record
  from public.inbox_items
  where id = target_item_id and user_id = actor_user_id and status = 'pending'
  for update;
  if not found then
    raise exception 'inbox_item_not_found' using errcode = 'P0002';
  end if;

  audit_namespace := case when item_record.wechat_projection_id is null then 'gmail' else 'wechat' end;

  if target_resolution = 'accept' and item_record.item_type = 'email_action' then
    insert into public.actions (
      user_id, context_type, context_id, track, title, due_at,
      priority, status, waiting_on, completion_criteria
    ) values (
      actor_user_id,
      case when item_record.target_type in ('opportunity', 'course') then item_record.target_type else 'personal' end,
      case when item_record.target_type in ('opportunity', 'course') then item_record.target_id else null end,
      case
        when item_record.target_type = 'opportunity' then (select track from public.opportunities where id = item_record.target_id and user_id = actor_user_id)
        when item_record.target_type = 'course' then 'academic'
        else 'personal'
      end,
      item_record.title,
      (select action_due_at from public.gmail_messages where id = item_record.gmail_message_id),
      'high', 'unscheduled', 'user', '根据 Gmail 证据完成并由用户确认结果'
    ) returning id into new_action_id;

    insert into public.timeline_entries (
      user_id, entity_type, entity_id, event_type, actor_type, summary, changes
    ) values (
      actor_user_id, 'action', new_action_id, 'gmail_action_confirmed', 'user',
      '用户确认从邮件创建行动', jsonb_build_object('inbox_item_id', item_record.id)
    );
  end if;

  if target_resolution = 'accept' and item_record.wechat_projection_id is not null then
    select * into projection_record
    from public.wechat_projections
    where id = item_record.wechat_projection_id and user_id = actor_user_id
    for update;
    if not found then
      raise exception 'wechat_projection_not_found' using errcode = 'P0002';
    end if;

    if projection_record.processing_status = 'pending' then
      insert into public.opportunity_candidates (
        user_id, track, company, role_title, location, deadline,
        source_summary, source_url, discovered_at, last_verified_at
      ) values (
        actor_user_id, projection_record.track, projection_record.company,
        projection_record.role_title, projection_record.location,
        projection_record.deadline, projection_record.evidence_excerpt,
        projection_record.source_url, projection_record.captured_at, now()
      ) returning id into new_candidate_id;

      update public.wechat_projections
      set processing_status = 'candidate', candidate_id = new_candidate_id,
          confidence = 1
      where id = projection_record.id;

      insert into public.timeline_entries (
        user_id, entity_type, entity_id, event_type, actor_type, summary, changes
      ) values (
        actor_user_id, 'candidate', new_candidate_id, 'wechat.candidate_confirmed', 'user',
        '用户确认微信待核岗位并加入候选池',
        jsonb_build_object('projection_id', projection_record.id,
          'rule_version', projection_record.rule_version)
      );
    end if;
  end if;

  update public.inbox_items
  set status = case when target_resolution = 'accept' then 'accepted' else 'dismissed' end,
      action_id = new_action_id, resolved_at = now()
  where id = item_record.id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, rule_version, outcome
  ) values (
    actor_user_id, 'user', audit_namespace || '.inbox_' || target_resolution,
    'inbox_item', item_record.id::text,
    jsonb_build_object('status', target_resolution, 'action_id', new_action_id,
      'candidate_id', new_candidate_id),
    jsonb_build_object('source', 'authenticated_rpc'),
    case when audit_namespace = 'wechat' then coalesce(projection_record.rule_version, 'wechat_rules_v1') else 'mail_rules_v1' end,
    'succeeded'
  );

  return new_action_id;
end;
$$;

revoke all on function private.create_my_wechat_manual_import(
  text, text, text, text, text, text, date, text, boolean
) from public, anon, authenticated;
revoke all on function private.resolve_my_inbox_item(uuid, text)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.create_my_wechat_manual_import(
  text, text, text, text, text, text, date, text, boolean
) to authenticated;
grant execute on function private.resolve_my_inbox_item(uuid, text)
  to authenticated;

create function public.create_my_wechat_manual_import(
  target_source_kind text,
  target_source_url text,
  target_track text,
  target_company text,
  target_role_title text,
  target_location text,
  target_deadline date,
  target_evidence_excerpt text,
  target_confirmed boolean
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
  select * from private.create_my_wechat_manual_import(
    target_source_kind, target_source_url, target_track, target_company,
    target_role_title, target_location, target_deadline,
    target_evidence_excerpt, target_confirmed
  );
$$;

create function public.resolve_my_inbox_item(
  target_item_id uuid,
  target_resolution text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.resolve_my_inbox_item(target_item_id, target_resolution);
$$;

revoke execute on function public.create_my_wechat_manual_import(
  text, text, text, text, text, text, date, text, boolean
) from public, anon, authenticated;
revoke execute on function public.resolve_my_inbox_item(uuid, text)
  from public, anon, authenticated;
grant execute on function public.create_my_wechat_manual_import(
  text, text, text, text, text, text, date, text, boolean
) to authenticated;
grant execute on function public.resolve_my_inbox_item(uuid, text)
  to authenticated;
