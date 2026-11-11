-- Issue #13: application package v1 (rule-based). The package prepares materials for
-- one tracked opportunity; it never submits, signs in, sends or contacts anyone.
-- Tables are owner-readable only; every write goes through invoker wrappers over
-- private SECURITY DEFINER functions that re-check auth.uid() and the privacy lock.

create table public.application_packages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'submitted_recorded', 'abandoned')),
  recommended_resume_version_id uuid references public.resume_versions(id) on delete set null,
  recommendation_reason text check (recommendation_reason is null or length(recommendation_reason) <= 1000),
  selected_resume_version_id uuid references public.resume_versions(id) on delete set null,
  selected_at timestamptz,
  official_apply_url text check (official_apply_url is null
    or (length(official_apply_url) <= 2048 and official_apply_url ~ '^https://')),
  suggested_start_on date,
  deadline_action_id uuid references public.actions(id) on delete set null,
  rule_version text not null check (length(rule_version) between 1 and 80),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, opportunity_id),
  constraint application_package_selection_shape
    check ((selected_resume_version_id is null) = (selected_at is null))
);

create table public.application_package_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid not null references public.application_packages(id) on delete cascade,
  item_key text not null check (item_key ~ '^[a-z_]{1,40}$'),
  label text not null check (length(label) between 1 and 120),
  required boolean not null default true,
  source text not null check (source in ('default', 'jd_rule')),
  evidence text check (evidence is null or length(evidence) <= 300),
  position smallint not null check (position between 0 and 100),
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (package_id, item_key),
  constraint application_package_item_done_shape check (done = (done_at is not null))
);

create index application_packages_opportunity_idx on public.application_packages (opportunity_id);
create index application_packages_recommended_resume_idx on public.application_packages (recommended_resume_version_id)
  where recommended_resume_version_id is not null;
create index application_packages_selected_resume_idx on public.application_packages (selected_resume_version_id)
  where selected_resume_version_id is not null;
create index application_packages_deadline_action_idx on public.application_packages (deadline_action_id)
  where deadline_action_id is not null;
create index application_package_items_user_idx on public.application_package_items (user_id);

create trigger application_packages_set_updated_at before update on public.application_packages
  for each row execute function private.set_updated_at();
create trigger application_package_items_set_updated_at before update on public.application_package_items
  for each row execute function private.set_updated_at();

alter table public.application_packages enable row level security;
alter table public.application_package_items enable row level security;

create policy application_packages_select_own on public.application_packages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy application_package_items_select_own on public.application_package_items
  for select to authenticated using ((select auth.uid()) = user_id);

revoke all on table public.application_packages, public.application_package_items from public, anon, authenticated;
grant select on table public.application_packages, public.application_package_items to authenticated;
grant select, insert, update, delete on table public.application_packages, public.application_package_items to service_role;

-- Create (or return) the package for one of the caller's opportunities.
-- target_items: [{"key","label","required","source","evidence"}], at most 20.
create function private.create_application_package(
  target_opportunity_id uuid,
  target_items jsonb,
  target_recommended_resume_version_id uuid,
  target_recommendation_reason text,
  target_official_apply_url text,
  target_suggested_start_on date,
  target_rule_version text
)
returns table(package_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.opportunities%rowtype;
  existing_id uuid;
  new_package_id uuid;
  new_action_id uuid;
  item jsonb;
  item_position smallint := 0;
begin
  if actor_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_items is null or jsonb_typeof(target_items) <> 'array' or jsonb_array_length(target_items) > 20
    or target_rule_version is null or length(target_rule_version) not between 1 and 80
    or (target_official_apply_url is not null and (length(target_official_apply_url) > 2048
      or target_official_apply_url !~ '^https://'))
    or (target_recommendation_reason is not null and length(target_recommendation_reason) > 1000)
  then
    raise exception 'invalid_application_package' using errcode = '22023';
  end if;

  select * into opportunity from public.opportunities
  where id = target_opportunity_id and user_id = actor_user_id;
  if not found then
    raise exception 'opportunity_not_found' using errcode = '42501';
  end if;
  if target_recommended_resume_version_id is not null and not exists (
    select 1 from public.resume_versions
    where id = target_recommended_resume_version_id and user_id = actor_user_id
  ) then
    raise exception 'resume_version_not_found' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_user_id::text || ':package:' || target_opportunity_id::text, 0)
  );
  select id into existing_id from public.application_packages
  where user_id = actor_user_id and opportunity_id = target_opportunity_id;
  if existing_id is not null then
    return query select existing_id, false;
    return;
  end if;

  if opportunity.deadline is not null then
    insert into public.actions (
      user_id, context_type, context_id, track, title, due_at, suggested_start_at,
      estimated_minutes, priority, status, completion_criteria
    ) values (
      actor_user_id, 'opportunity', opportunity.id, opportunity.track,
      left('提交申请：' || opportunity.company || ' · ' || opportunity.role_title, 300),
      (opportunity.deadline::text || ' 18:00:00+08')::timestamptz,
      case when target_suggested_start_on is null then null
        else (target_suggested_start_on::text || ' 09:00:00+08')::timestamptz end,
      120,
      case when opportunity.deadline <= current_date + 7 then 'high' else 'normal' end,
      'unscheduled',
      '在官网完成提交后，回到投递包点击“我已投递”'
    ) returning id into new_action_id;
  end if;

  insert into public.application_packages (
    user_id, opportunity_id, recommended_resume_version_id, recommendation_reason,
    official_apply_url, suggested_start_on, deadline_action_id, rule_version
  ) values (
    actor_user_id, opportunity.id, target_recommended_resume_version_id,
    nullif(btrim(target_recommendation_reason), ''), target_official_apply_url,
    target_suggested_start_on, new_action_id, target_rule_version
  ) returning id into new_package_id;

  for item in select value from jsonb_array_elements(target_items)
  loop
    insert into public.application_package_items (
      user_id, package_id, item_key, label, required, source, evidence, position
    ) values (
      actor_user_id, new_package_id, item->>'key', item->>'label',
      coalesce((item->>'required')::boolean, true), item->>'source',
      nullif(left(item->>'evidence', 300), ''), item_position
    );
    item_position := item_position + 1;
  end loop;

  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', opportunity.id, 'application_package_created', 'user',
    '已创建投递包（规则版）；提交仍需你在官网完成',
    jsonb_build_object('packageId', new_package_id, 'items', jsonb_array_length(target_items),
      'deadlineActionId', new_action_id, 'ruleVersion', target_rule_version));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, after_state,
    permission_decision, rule_version, outcome)
  values (actor_user_id, 'user', 'application_package.create', 'application_package', new_package_id::text,
    jsonb_build_object('opportunityId', opportunity.id, 'items', jsonb_array_length(target_items),
      'recommendedResumeVersionId', target_recommended_resume_version_id, 'deadlineActionId', new_action_id),
    jsonb_build_object('source', 'user_click'), target_rule_version, 'succeeded');

  return query select new_package_id, true;
end;
$$;

-- The user confirms which resume version this application will use.
create function private.confirm_application_package_resume(target_package_id uuid, target_resume_version_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  package public.application_packages%rowtype;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into package from public.application_packages
  where id = target_package_id and user_id = actor_user_id for update;
  if not found or package.status in ('submitted_recorded', 'abandoned') then
    raise exception 'package_not_editable' using errcode = '42501';
  end if;
  if not exists (select 1 from public.resume_versions where id = target_resume_version_id and user_id = actor_user_id) then
    raise exception 'resume_version_not_found' using errcode = '42501';
  end if;
  update public.application_packages
  set selected_resume_version_id = target_resume_version_id, selected_at = now(), version = version + 1
  where id = package.id;
  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', package.opportunity_id, 'application_package_resume_confirmed', 'user',
    '已确认本次申请使用的简历版本',
    jsonb_build_object('packageId', package.id, 'resumeVersionId', target_resume_version_id,
      'previousResumeVersionId', package.selected_resume_version_id));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state, outcome)
  values (actor_user_id, 'user', 'application_package.confirm_resume', 'application_package', package.id::text,
    jsonb_build_object('selectedResumeVersionId', package.selected_resume_version_id),
    jsonb_build_object('selectedResumeVersionId', target_resume_version_id), 'succeeded');
end;
$$;

create function private.set_application_package_item(target_item_id uuid, target_done boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  package_status text;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select p.status into package_status
  from public.application_package_items i
  join public.application_packages p on p.id = i.package_id
  where i.id = target_item_id and i.user_id = actor_user_id;
  if package_status is null or package_status in ('submitted_recorded', 'abandoned') then
    raise exception 'package_not_editable' using errcode = '42501';
  end if;
  update public.application_package_items
  set done = coalesce(target_done, false), done_at = case when coalesce(target_done, false) then now() else null end
  where id = target_item_id and user_id = actor_user_id;
end;
$$;

-- Draft <-> ready, or abandon. 'submitted_recorded' is reserved for the
-- "I have submitted" flow (#14) and cannot be set here.
create function private.set_application_package_status(target_package_id uuid, target_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  package public.application_packages%rowtype;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_status not in ('draft', 'ready', 'abandoned') then
    raise exception 'invalid_package_status' using errcode = '22023';
  end if;
  select * into package from public.application_packages
  where id = target_package_id and user_id = actor_user_id for update;
  if not found or package.status in ('submitted_recorded', 'abandoned') then
    raise exception 'package_not_editable' using errcode = '42501';
  end if;
  if package.status = target_status then
    return;
  end if;
  update public.application_packages set status = target_status, version = version + 1 where id = package.id;
  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', package.opportunity_id, 'application_package_status', 'user',
    case target_status when 'ready' then '投递包已标记为准备就绪'
      when 'abandoned' then '已放弃本次投递包' else '投递包已改回草稿' end,
    jsonb_build_object('packageId', package.id, 'from', package.status, 'to', target_status));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state, outcome)
  values (actor_user_id, 'user', 'application_package.set_status', 'application_package', package.id::text,
    jsonb_build_object('status', package.status), jsonb_build_object('status', target_status), 'succeeded');
end;
$$;

-- Public invoker wrappers (the only API surface).
create function public.create_my_application_package(
  target_opportunity_id uuid, target_items jsonb, target_recommended_resume_version_id uuid,
  target_recommendation_reason text, target_official_apply_url text, target_suggested_start_on date,
  target_rule_version text
) returns table(package_id uuid, created boolean)
language sql security invoker set search_path = '' as $$
  select * from private.create_application_package(target_opportunity_id, target_items,
    target_recommended_resume_version_id, target_recommendation_reason, target_official_apply_url,
    target_suggested_start_on, target_rule_version)
$$;
create function public.confirm_my_application_package_resume(target_package_id uuid, target_resume_version_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.confirm_application_package_resume(target_package_id, target_resume_version_id)
$$;
create function public.set_my_application_package_item(target_item_id uuid, target_done boolean)
returns void language sql security invoker set search_path = '' as $$
  select private.set_application_package_item(target_item_id, target_done)
$$;
create function public.set_my_application_package_status(target_package_id uuid, target_status text)
returns void language sql security invoker set search_path = '' as $$
  select private.set_application_package_status(target_package_id, target_status)
$$;

revoke all on function private.create_application_package(uuid, jsonb, uuid, text, text, date, text) from public, anon;
revoke all on function private.confirm_application_package_resume(uuid, uuid) from public, anon;
revoke all on function private.set_application_package_item(uuid, boolean) from public, anon;
revoke all on function private.set_application_package_status(uuid, text) from public, anon;
grant execute on function private.create_application_package(uuid, jsonb, uuid, text, text, date, text) to authenticated, service_role;
grant execute on function private.confirm_application_package_resume(uuid, uuid) to authenticated, service_role;
grant execute on function private.set_application_package_item(uuid, boolean) to authenticated, service_role;
grant execute on function private.set_application_package_status(uuid, text) to authenticated, service_role;

revoke all on function public.create_my_application_package(uuid, jsonb, uuid, text, text, date, text) from public, anon;
revoke all on function public.confirm_my_application_package_resume(uuid, uuid) from public, anon;
revoke all on function public.set_my_application_package_item(uuid, boolean) from public, anon;
revoke all on function public.set_my_application_package_status(uuid, text) from public, anon;
grant execute on function public.create_my_application_package(uuid, jsonb, uuid, text, text, date, text) to authenticated, service_role;
grant execute on function public.confirm_my_application_package_resume(uuid, uuid) to authenticated, service_role;
grant execute on function public.set_my_application_package_item(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_my_application_package_status(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
