-- Issue #14: "I have submitted" records a fact and an immutable application snapshot.
-- The user submits on the employer's own site; this flow never contacts any external
-- system. Snapshots cannot be edited; an undo marks the snapshot as undone (kept for
-- history) and restores the opportunity, package and deadline action it changed.

create table public.application_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  package_id uuid references public.application_packages(id) on delete cascade,
  track text not null check (track in ('internship', 'graduate')),
  company text not null check (length(company) between 1 and 240),
  role_title text not null check (length(role_title) between 1 and 240),
  jd_text text check (jd_text is null or length(jd_text) <= 50000),
  source_url text check (source_url is null or length(source_url) <= 2048),
  -- Identifiers and labels are copied, not referenced, so later edits or deletions of
  -- resume versions cannot rewrite what this snapshot says was submitted.
  resume_version_id uuid,
  resume_label text check (resume_label is null or length(resume_label) <= 200),
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array' and pg_column_size(checklist) <= 32768),
  answers_text text check (answers_text is null or length(answers_text) <= 20000),
  application_reference text check (application_reference is null or length(application_reference) <= 200),
  submitted_at timestamptz not null,
  previous_state jsonb not null check (jsonb_typeof(previous_state) = 'object'),
  opportunity_version_after bigint not null,
  status text not null default 'active' check (status in ('active', 'undone')),
  undone_at timestamptz,
  created_at timestamptz not null default now(),
  constraint application_snapshot_undo_shape check ((status = 'undone') = (undone_at is not null))
);

create unique index application_snapshots_one_active_idx
  on public.application_snapshots (opportunity_id) where status = 'active';
create index application_snapshots_user_idx on public.application_snapshots (user_id, created_at desc);
create index application_snapshots_package_idx on public.application_snapshots (package_id) where package_id is not null;

-- Immutable except for the single active -> undone transition.
create function private.guard_application_snapshot()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'active' and new.status = 'undone' and new.undone_at is not null
    and (to_jsonb(new) - 'status' - 'undone_at') = (to_jsonb(old) - 'status' - 'undone_at') then
    return new;
  end if;
  raise exception 'application_snapshot_is_immutable' using errcode = '23514';
end;
$$;

create trigger application_snapshots_immutable before update on public.application_snapshots
  for each row execute function private.guard_application_snapshot();

alter table public.application_snapshots enable row level security;
create policy application_snapshots_select_own on public.application_snapshots
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.application_snapshots from public, anon, authenticated;
grant select on table public.application_snapshots to authenticated;
grant select, insert, update, delete on table public.application_snapshots to service_role;

create function private.record_application_submitted(
  target_opportunity_id uuid,
  target_submitted_on date,
  target_application_reference text,
  target_answers_text text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  opportunity public.opportunities%rowtype;
  package public.application_packages%rowtype;
  action_status text;
  package_found boolean;
  resume_label text;
  new_snapshot_id uuid;
  new_version bigint;
  submitted timestamptz;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if (target_application_reference is not null and length(target_application_reference) > 200)
    or (target_answers_text is not null and length(target_answers_text) > 20000)
    or (target_submitted_on is not null and (target_submitted_on > current_date + 1 or target_submitted_on < current_date - 365))
  then
    raise exception 'invalid_submission_record' using errcode = '22023';
  end if;

  select * into opportunity from public.opportunities
  where id = target_opportunity_id and user_id = actor_user_id for update;
  if not found then
    raise exception 'opportunity_not_found' using errcode = '42501';
  end if;
  if opportunity.main_stage not in ('new', 'evaluation', 'preparation', 'submitted') then
    raise exception 'opportunity_already_past_submission' using errcode = '22023';
  end if;
  if exists (select 1 from public.application_snapshots where opportunity_id = opportunity.id and status = 'active') then
    raise exception 'submission_already_recorded' using errcode = '23505';
  end if;

  select * into package from public.application_packages
  where opportunity_id = opportunity.id and user_id = actor_user_id for update;
  package_found := found;
  if package_found and package.deadline_action_id is not null then
    select status into action_status from public.actions where id = package.deadline_action_id;
  end if;
  if package_found and package.selected_resume_version_id is not null then
    select d.label || ' v' || v.version_number into resume_label
    from public.resume_versions v join public.resume_documents d on d.id = v.document_id
    where v.id = package.selected_resume_version_id;
  end if;

  submitted := case when target_submitted_on is null then now()
    else (target_submitted_on::text || ' 12:00:00+08')::timestamptz end;

  update public.opportunities
  set main_stage = 'submitted', applied_at = submitted, waiting_on = 'other_party', version = version + 1
  where id = opportunity.id
  returning version into new_version;

  if package_found then
    update public.application_packages set status = 'submitted_recorded', version = version + 1 where id = package.id;
    if action_status is not null and action_status not in ('completed', 'cancelled') then
      update public.actions set status = 'completed', completed_at = now(), version = version + 1
      where id = package.deadline_action_id;
    end if;
  end if;

  insert into public.application_snapshots (
    user_id, opportunity_id, package_id, track, company, role_title, jd_text, source_url,
    resume_version_id, resume_label, checklist, answers_text, application_reference,
    submitted_at, previous_state, opportunity_version_after
  ) values (
    actor_user_id, opportunity.id, package.id, opportunity.track, opportunity.company, opportunity.role_title,
    opportunity.raw_jd, opportunity.source_url, package.selected_resume_version_id, resume_label,
    coalesce((select jsonb_agg(jsonb_build_object('key', i.item_key, 'label', i.label,
      'required', i.required, 'done', i.done) order by i.position)
      from public.application_package_items i where i.package_id = package.id), '[]'::jsonb),
    nullif(btrim(target_answers_text), ''), nullif(btrim(target_application_reference), ''),
    submitted,
    jsonb_build_object(
      'mainStage', opportunity.main_stage, 'appliedAt', opportunity.applied_at,
      'waitingOn', opportunity.waiting_on, 'packageStatus', package.status,
      'deadlineActionId', package.deadline_action_id, 'deadlineActionStatus', action_status),
    new_version
  ) returning id into new_snapshot_id;

  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', opportunity.id, 'application_submitted_recorded', 'user',
    '你已在官网提交申请；系统记录了投递时间与申请快照（系统没有代你提交）',
    jsonb_build_object('snapshotId', new_snapshot_id, 'from', opportunity.main_stage, 'to', 'submitted',
      'submittedAt', submitted, 'hasReference', target_application_reference is not null));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state,
    permission_decision, outcome, reversible)
  values (actor_user_id, 'user', 'application.record_submitted', 'opportunity', opportunity.id::text,
    jsonb_build_object('mainStage', opportunity.main_stage, 'appliedAt', opportunity.applied_at),
    jsonb_build_object('mainStage', 'submitted', 'appliedAt', submitted, 'snapshotId', new_snapshot_id),
    jsonb_build_object('source', 'user_click', 'externalAction', false), 'succeeded', true);

  return new_snapshot_id;
end;
$$;

create function private.undo_application_submitted(target_snapshot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  snapshot public.application_snapshots%rowtype;
  current_version bigint;
  previous jsonb;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into snapshot from public.application_snapshots
  where id = target_snapshot_id and user_id = actor_user_id and status = 'active' for update;
  if not found then
    raise exception 'snapshot_not_found' using errcode = '42501';
  end if;
  select version into current_version from public.opportunities where id = snapshot.opportunity_id for update;
  if current_version is distinct from snapshot.opportunity_version_after then
    raise exception 'opportunity_changed_since_submission' using errcode = '40001';
  end if;
  previous := snapshot.previous_state;

  update public.opportunities
  set main_stage = previous->>'mainStage',
      applied_at = nullif(previous->>'appliedAt', '')::timestamptz,
      waiting_on = previous->>'waitingOn',
      version = version + 1
  where id = snapshot.opportunity_id;

  if snapshot.package_id is not null and previous->>'packageStatus' is not null then
    update public.application_packages set status = previous->>'packageStatus', version = version + 1
    where id = snapshot.package_id and status = 'submitted_recorded';
  end if;
  if previous->>'deadlineActionId' is not null and previous->>'deadlineActionStatus' not in ('completed', 'cancelled') then
    update public.actions set status = previous->>'deadlineActionStatus', completed_at = null, version = version + 1
    where id = (previous->>'deadlineActionId')::uuid and status = 'completed';
  end if;

  update public.application_snapshots set status = 'undone', undone_at = now() where id = snapshot.id;

  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', snapshot.opportunity_id, 'application_submitted_undone', 'user',
    '已撤销“我已投递”记录；申请快照保留为历史',
    jsonb_build_object('snapshotId', snapshot.id, 'restoredStage', previous->>'mainStage'));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state, outcome)
  values (actor_user_id, 'user', 'application.undo_submitted', 'opportunity', snapshot.opportunity_id::text,
    jsonb_build_object('mainStage', 'submitted', 'snapshotId', snapshot.id),
    jsonb_build_object('mainStage', previous->>'mainStage'), 'succeeded');
end;
$$;

create function public.record_my_application_submitted(
  target_opportunity_id uuid, target_submitted_on date, target_application_reference text, target_answers_text text
) returns uuid
language sql security invoker set search_path = '' as $$
  select private.record_application_submitted(target_opportunity_id, target_submitted_on,
    target_application_reference, target_answers_text)
$$;
create function public.undo_my_application_submitted(target_snapshot_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select private.undo_application_submitted(target_snapshot_id)
$$;

revoke all on function private.guard_application_snapshot() from public, anon, authenticated;
revoke all on function private.record_application_submitted(uuid, date, text, text) from public, anon;
revoke all on function private.undo_application_submitted(uuid) from public, anon;
grant execute on function private.record_application_submitted(uuid, date, text, text) to authenticated, service_role;
grant execute on function private.undo_application_submitted(uuid) to authenticated, service_role;
revoke all on function public.record_my_application_submitted(uuid, date, text, text) from public, anon;
revoke all on function public.undo_my_application_submitted(uuid) from public, anon;
grant execute on function public.record_my_application_submitted(uuid, date, text, text) to authenticated, service_role;
grant execute on function public.undo_my_application_submitted(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
