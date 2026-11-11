-- M3: candidate pools, three long-lived workspaces, actions, offline mutations,
-- and explicit conflict resolution. All browser-reachable tables use RLS and
-- explicit Data API grants.

create table public.opportunity_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  track text not null check (track in ('internship', 'graduate')),
  company text not null check (length(company) between 1 and 240),
  department text check (department is null or length(department) <= 240),
  role_title text not null check (length(role_title) between 1 and 240),
  location text check (location is null or length(location) <= 240),
  work_mode text check (work_mode is null or work_mode in ('onsite', 'hybrid', 'remote', 'unspecified')),
  deadline date,
  source_summary text check (source_summary is null or length(source_summary) <= 1000),
  source_url text check (source_url is null or length(source_url) <= 2048),
  discovered_at timestamptz not null default now(),
  last_verified_at timestamptz,
  qualification_score smallint check (qualification_score is null or qualification_score between 0 and 5),
  match_score smallint check (match_score is null or match_score between 0 and 5),
  interest_score smallint check (interest_score is null or interest_score between 0 and 5),
  urgency_score smallint check (urgency_score is null or urgency_score between 0 and 5),
  decision_status text not null default 'candidate' check (decision_status in ('candidate', 'later', 'dismissed', 'promoted')),
  decision_reason text check (decision_reason is null or length(decision_reason) <= 1000),
  promoted_opportunity_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  candidate_id uuid references public.opportunity_candidates(id) on delete set null,
  track text not null check (track in ('internship', 'graduate')),
  intent text not null default 'track' check (intent in ('track', 'apply')),
  company text not null check (length(company) between 1 and 240),
  department text check (department is null or length(department) <= 240),
  role_title text not null check (length(role_title) between 1 and 240),
  location text check (location is null or length(location) <= 240),
  work_mode text check (work_mode is null or work_mode in ('onsite', 'hybrid', 'remote', 'unspecified')),
  deadline date,
  source_summary text check (source_summary is null or length(source_summary) <= 1000),
  source_url text check (source_url is null or length(source_url) <= 2048),
  main_stage text not null default 'evaluation' check (
    main_stage in ('new', 'evaluation', 'preparation', 'submitted', 'test', 'interview', 'waiting', 'offer', 'ended')
  ),
  substage text check (substage is null or length(substage) <= 120),
  close_reason text check (
    close_reason is null or close_reason in ('rejected', 'withdrawn', 'closed', 'ineligible', 'expired')
  ),
  applied_at timestamptz,
  waiting_on text check (waiting_on is null or waiting_on in ('user', 'other_party', 'none', 'insufficient_information')),
  record_state text not null default 'active' check (record_state in ('active', 'archived')),
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, candidate_id),
  constraint opportunity_close_reason check (
    (main_stage = 'ended' and close_reason is not null) or (main_stage <> 'ended' and close_reason is null)
  ),
  constraint opportunity_applied_stage check (
    applied_at is null or main_stage in ('submitted', 'test', 'interview', 'waiting', 'offer', 'ended')
  )
);

alter table public.opportunity_candidates
  add constraint opportunity_candidates_promoted_fk
  foreign key (promoted_opportunity_id) references public.opportunities(id) on delete set null;

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  module smallint check (module is null or module between 1 and 12),
  course_code text not null check (length(course_code) between 1 and 40),
  title text not null check (length(title) between 1 and 240),
  starts_on date,
  ends_on date,
  fixed_schedule text check (fixed_schedule is null or length(fixed_schedule) <= 1000),
  course_status text not null default 'on_track' check (course_status in ('on_track', 'attention', 'behind', 'ended')),
  next_deadline timestamptz,
  record_state text not null default 'active' check (record_state in ('active', 'archived')),
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, course_code),
  constraint course_date_order check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create table public.actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_type text not null check (context_type in ('opportunity', 'course', 'personal')),
  context_id uuid,
  track text check (track is null or track in ('internship', 'graduate', 'academic', 'personal')),
  title text not null check (length(title) between 1 and 300),
  due_at timestamptz,
  suggested_start_at timestamptz,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes between 1 and 10080),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  status text not null default 'unscheduled' check (status in ('unscheduled', 'scheduled', 'waiting', 'completed', 'cancelled')),
  waiting_on text check (waiting_on is null or waiting_on in ('user', 'other_party', 'none', 'insufficient_information')),
  completion_criteria text check (completion_criteria is null or length(completion_criteria) <= 1000),
  completed_at timestamptz,
  cancelled_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint action_context_shape check (
    (context_type = 'personal' and context_id is null and track = 'personal')
    or (context_type = 'opportunity' and context_id is not null and track in ('internship', 'graduate'))
    or (context_type = 'course' and context_id is not null and track = 'academic')
  ),
  constraint action_terminal_timestamps check (
    (status = 'completed' and completed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and cancelled_at is not null and completed_at is null)
    or (status not in ('completed', 'cancelled') and completed_at is null and cancelled_at is null)
  )
);

create table public.action_dependencies (
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  depends_on_action_id uuid not null references public.actions(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (action_id, depends_on_action_id),
  constraint action_dependency_not_self check (action_id <> depends_on_action_id)
);

create table public.timeline_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('candidate', 'opportunity', 'course', 'action')),
  entity_id uuid not null,
  event_type text not null check (length(event_type) between 1 and 100),
  actor_type text not null check (actor_type in ('user', 'ai', 'sync', 'system')),
  summary text not null check (length(summary) between 1 and 1000),
  changes jsonb not null default '{}',
  client_mutation_id uuid,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint timeline_changes_object check (jsonb_typeof(changes) = 'object'),
  constraint timeline_changes_size check (pg_column_size(changes) <= 32768)
);

create table public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('internship', 'graduate', 'academic')),
  field_key text not null check (field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text not null check (length(label) between 1 and 120),
  field_type text not null check (field_type in ('text', 'date', 'option', 'rating', 'link')),
  options jsonb not null default '[]',
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, field_key),
  constraint custom_field_options_array check (jsonb_typeof(options) = 'array'),
  constraint custom_field_options_size check (pg_column_size(options) <= 8192)
);

create table public.custom_field_values (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  definition_id uuid not null references public.custom_field_definitions(id) on delete cascade,
  entity_type text not null check (entity_type in ('opportunity', 'course')),
  entity_id uuid not null,
  value jsonb not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (definition_id, entity_type, entity_id),
  constraint custom_field_value_size check (pg_column_size(value) <= 8192)
);

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope in ('internship_candidates', 'graduate_candidates', 'internships', 'graduate', 'academics', 'actions')),
  name text not null check (length(name) between 1 and 120),
  filters jsonb not null default '{}',
  sort_spec jsonb not null default '[]',
  visible_columns text[] not null default '{}',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, scope, name),
  constraint saved_view_filters_object check (jsonb_typeof(filters) = 'object'),
  constraint saved_view_sort_array check (jsonb_typeof(sort_spec) = 'array'),
  constraint saved_view_payload_size check (pg_column_size(filters) + pg_column_size(sort_spec) <= 16384)
);

create table public.client_mutations (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null check (length(device_id) between 1 and 120),
  object_type text not null check (object_type in ('opportunity', 'course', 'action')),
  object_id uuid not null,
  base_version bigint not null check (base_version > 0),
  patch jsonb not null,
  result jsonb not null,
  status text not null check (status in ('applied', 'partial', 'conflict')),
  created_at timestamptz not null default now(),
  constraint client_mutation_patch_object check (jsonb_typeof(patch) = 'object'),
  constraint client_mutation_payload_size check (pg_column_size(patch) + pg_column_size(result) <= 32768)
);

create table public.sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_mutation_id uuid not null,
  object_type text not null check (object_type in ('opportunity', 'course', 'action')),
  object_id uuid not null,
  field_path text not null check (length(field_path) between 1 and 120),
  base_version bigint not null check (base_version > 0),
  server_record_version bigint not null check (server_record_version > 0),
  base_value jsonb,
  local_value jsonb,
  server_value jsonb,
  status text not null default 'pending' check (status in ('pending', 'resolved', 'discarded')),
  resolution text check (resolution is null or resolution in ('use_local', 'use_server', 'manual')),
  resolved_value jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint sync_conflict_payload_size check (
    coalesce(pg_column_size(base_value), 0) + coalesce(pg_column_size(local_value), 0) +
    coalesce(pg_column_size(server_value), 0) + coalesce(pg_column_size(resolved_value), 0) <= 16384
  ),
  constraint sync_conflict_resolution_shape check (
    (status = 'pending' and resolution is null and resolved_at is null)
    or (status in ('resolved', 'discarded') and resolution is not null and resolved_at is not null)
  )
);

create unique index sync_conflicts_one_pending_field_idx
  on public.sync_conflicts (user_id, object_type, object_id, field_path)
  where status = 'pending';

create index opportunity_candidates_track_status_idx
  on public.opportunity_candidates (user_id, track, decision_status, updated_at desc);
create index opportunities_track_state_idx
  on public.opportunities (user_id, track, record_state, updated_at desc);
create index opportunities_stage_idx
  on public.opportunities (user_id, track, main_stage, deadline);
create index courses_state_module_idx
  on public.courses (user_id, record_state, module, updated_at desc);
create index actions_context_idx
  on public.actions (user_id, context_type, context_id, status, due_at);
create index action_dependencies_depends_idx
  on public.action_dependencies (depends_on_action_id);
create index timeline_entries_entity_idx
  on public.timeline_entries (user_id, entity_type, entity_id, occurred_at desc);
create index custom_field_values_entity_idx
  on public.custom_field_values (user_id, entity_type, entity_id);
create index saved_views_scope_idx
  on public.saved_views (user_id, scope, is_default desc, name);
create index client_mutations_object_idx
  on public.client_mutations (user_id, object_type, object_id, created_at desc);
create index sync_conflicts_pending_idx
  on public.sync_conflicts (user_id, status, created_at desc);

create trigger opportunity_candidates_set_updated_at before update on public.opportunity_candidates
for each row execute function private.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
for each row execute function private.set_updated_at();
create trigger courses_set_updated_at before update on public.courses
for each row execute function private.set_updated_at();
create trigger actions_set_updated_at before update on public.actions
for each row execute function private.set_updated_at();
create trigger custom_field_definitions_set_updated_at before update on public.custom_field_definitions
for each row execute function private.set_updated_at();
create trigger custom_field_values_set_updated_at before update on public.custom_field_values
for each row execute function private.set_updated_at();
create trigger saved_views_set_updated_at before update on public.saved_views
for each row execute function private.set_updated_at();

create or replace function private.m3_writes_allowed(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user_id = auth.uid()
    and not exists (
      select 1 from public.privacy_locks
      where user_id = target_user_id and is_locked
    );
$$;

create or replace function private.validate_action_context()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.context_type = 'opportunity' and not exists (
    select 1 from public.opportunities o
    where o.id = new.context_id and o.user_id = new.user_id and o.track = new.track
  ) then
    raise exception 'invalid_opportunity_context' using errcode = '23503';
  elsif new.context_type = 'course' and not exists (
    select 1 from public.courses c where c.id = new.context_id and c.user_id = new.user_id
  ) then
    raise exception 'invalid_course_context' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger actions_validate_context before insert or update of context_type, context_id, track, user_id
on public.actions for each row execute function private.validate_action_context();

create or replace function private.validate_action_dependency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.actions a
    where a.id = new.action_id and a.user_id = new.user_id
  ) or not exists (
    select 1 from public.actions a
    where a.id = new.depends_on_action_id and a.user_id = new.user_id
  ) then
    raise exception 'invalid_action_dependency' using errcode = '23503';
  end if;

  if exists (
    with recursive dependency_path(action_id) as (
      select new.depends_on_action_id
      union all
      select d.depends_on_action_id
      from public.action_dependencies d
      join dependency_path p on d.action_id = p.action_id
      where d.user_id = new.user_id
    )
    select 1 from dependency_path where action_id = new.action_id
  ) then
    raise exception 'cyclic_action_dependency' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger action_dependencies_validate before insert or update on public.action_dependencies
for each row execute function private.validate_action_dependency();

create or replace function private.reject_m3_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'timeline_entries' and private.contains_sensitive_key(new.changes) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'custom_field_definitions' and private.contains_sensitive_key(new.options) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'custom_field_values' and private.contains_sensitive_key(new.value) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'saved_views' and (
    private.contains_sensitive_key(new.filters) or private.contains_sensitive_key(new.sort_spec)
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'client_mutations' and (
    private.contains_sensitive_key(new.patch) or private.contains_sensitive_key(new.result)
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  elsif tg_table_name = 'sync_conflicts' and (
    private.contains_sensitive_key(new.base_value) or private.contains_sensitive_key(new.local_value)
    or private.contains_sensitive_key(new.server_value) or private.contains_sensitive_key(new.resolved_value)
  ) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger timeline_entries_reject_sensitive before insert or update on public.timeline_entries
for each row execute function private.reject_m3_sensitive_payload();
create trigger custom_field_definitions_reject_sensitive before insert or update on public.custom_field_definitions
for each row execute function private.reject_m3_sensitive_payload();
create trigger custom_field_values_reject_sensitive before insert or update on public.custom_field_values
for each row execute function private.reject_m3_sensitive_payload();
create trigger saved_views_reject_sensitive before insert or update on public.saved_views
for each row execute function private.reject_m3_sensitive_payload();
create trigger client_mutations_reject_sensitive before insert or update on public.client_mutations
for each row execute function private.reject_m3_sensitive_payload();
create trigger sync_conflicts_reject_sensitive before insert or update on public.sync_conflicts
for each row execute function private.reject_m3_sensitive_payload();

create or replace function private.append_workspace_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text;
  target_summary text;
begin
  target_type := case tg_table_name
    when 'opportunity_candidates' then 'candidate'
    when 'opportunities' then 'opportunity'
    when 'courses' then 'course'
    when 'actions' then 'action'
  end;
  target_summary := case tg_table_name
    when 'opportunity_candidates' then '候选岗位已加入候选池'
    when 'opportunities' then '正式追踪记录已创建'
    when 'courses' then '课程已加入学业表'
    when 'actions' then '行动已创建'
  end;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    new.user_id, target_type, new.id, 'created', 'user', target_summary,
    jsonb_build_object('version', new.version)
  );
  return new;
end;
$$;

create trigger opportunity_candidates_append_creation after insert on public.opportunity_candidates
for each row execute function private.append_workspace_creation();
create trigger opportunities_append_creation after insert on public.opportunities
for each row execute function private.append_workspace_creation();
create trigger courses_append_creation after insert on public.courses
for each row execute function private.append_workspace_creation();
create trigger actions_append_creation after insert on public.actions
for each row execute function private.append_workspace_creation();

create or replace function public.promote_opportunity_candidate(
  target_candidate_id uuid,
  target_intent text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  candidate public.opportunity_candidates%rowtype;
  opportunity_id uuid;
begin
  if target_intent not in ('track', 'apply') then
    raise exception 'invalid_candidate_intent' using errcode = '22023';
  end if;

  select * into candidate
  from public.opportunity_candidates
  where id = target_candidate_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'candidate_not_found' using errcode = 'P0002';
  end if;
  if candidate.decision_status = 'promoted' then
    return candidate.promoted_opportunity_id;
  end if;
  if candidate.decision_status = 'dismissed' then
    raise exception 'dismissed_candidate_cannot_be_promoted' using errcode = '23514';
  end if;

  insert into public.opportunities (
    user_id, candidate_id, track, intent, company, department, role_title,
    location, work_mode, deadline, source_summary, source_url, main_stage
  ) values (
    candidate.user_id, candidate.id, candidate.track, target_intent,
    candidate.company, candidate.department, candidate.role_title,
    candidate.location, candidate.work_mode, candidate.deadline,
    candidate.source_summary, candidate.source_url,
    case when target_intent = 'apply' then 'preparation' else 'evaluation' end
  ) returning id into opportunity_id;

  update public.opportunity_candidates
  set decision_status = 'promoted', promoted_opportunity_id = opportunity_id,
      version = version + 1
  where id = candidate.id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    candidate.user_id, 'candidate', candidate.id, 'promoted', 'user',
    case when target_intent = 'apply' then '已选择申请并进入正式表' else '已选择追踪并进入正式表' end,
    jsonb_build_object('opportunityId', opportunity_id, 'intent', target_intent)
  );

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, before_state, after_state,
    permission_decision, outcome
  ) values (
    candidate.user_id, 'user', 'candidate.promote', 'candidate', candidate.id::text,
    jsonb_build_object('decisionStatus', candidate.decision_status),
    jsonb_build_object('decisionStatus', 'promoted', 'opportunityId', opportunity_id, 'intent', target_intent),
    jsonb_build_object('source', 'user_confirmation'), 'succeeded'
  );
  return opportunity_id;
end;
$$;

create or replace function public.apply_workspace_mutation(
  target_mutation_id uuid,
  target_device_id text,
  target_object_type text,
  target_object_id uuid,
  target_base_version bigint,
  target_base_values jsonb,
  target_patch jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_result jsonb;
  current_data jsonb;
  current_version bigint;
  allowed_fields text[];
  patch_key text;
  safe_patch jsonb := '{}';
  conflict_count integer := 0;
  changed_count integer := 0;
  mutation_status text;
  result_payload jsonb;
  opportunity public.opportunities%rowtype;
  patched_opportunity public.opportunities%rowtype;
  course public.courses%rowtype;
  patched_course public.courses%rowtype;
  action_record public.actions%rowtype;
  patched_action public.actions%rowtype;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if not private.m3_writes_allowed(auth.uid()) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_device_id is null or length(target_device_id) not between 1 and 120 then
    raise exception 'invalid_device_id' using errcode = '22023';
  end if;
  if target_base_version <= 0 or jsonb_typeof(target_patch) <> 'object'
     or jsonb_typeof(target_base_values) <> 'object' or target_patch = '{}'::jsonb
     or pg_column_size(target_patch) + pg_column_size(target_base_values) > 24576 then
    raise exception 'invalid_mutation_payload' using errcode = '22023';
  end if;

  select result into existing_result
  from public.client_mutations
  where id = target_mutation_id and user_id = auth.uid();
  if found then
    return existing_result;
  end if;

  if target_object_type = 'opportunity' then
    allowed_fields := array[
      'company', 'department', 'role_title', 'location', 'work_mode', 'deadline',
      'main_stage', 'substage', 'close_reason', 'applied_at', 'waiting_on', 'record_state'
    ];
    select * into opportunity from public.opportunities
    where id = target_object_id and user_id = auth.uid() for update;
    if not found then raise exception 'workspace_object_not_found' using errcode = 'P0002'; end if;
    current_data := to_jsonb(opportunity);
    current_version := opportunity.version;
  elsif target_object_type = 'course' then
    allowed_fields := array[
      'module', 'course_code', 'title', 'starts_on', 'ends_on', 'fixed_schedule',
      'course_status', 'next_deadline', 'record_state'
    ];
    select * into course from public.courses
    where id = target_object_id and user_id = auth.uid() for update;
    if not found then raise exception 'workspace_object_not_found' using errcode = 'P0002'; end if;
    current_data := to_jsonb(course);
    current_version := course.version;
  elsif target_object_type = 'action' then
    allowed_fields := array[
      'title', 'due_at', 'suggested_start_at', 'estimated_minutes', 'priority',
      'status', 'waiting_on', 'completion_criteria'
    ];
    select * into action_record from public.actions
    where id = target_object_id and user_id = auth.uid() for update;
    if not found then raise exception 'workspace_object_not_found' using errcode = 'P0002'; end if;
    current_data := to_jsonb(action_record);
    current_version := action_record.version;
  else
    raise exception 'invalid_workspace_object_type' using errcode = '22023';
  end if;

  for patch_key in select jsonb_object_keys(target_patch)
  loop
    if not patch_key = any(allowed_fields) or not target_base_values ? patch_key then
      raise exception 'invalid_or_missing_base_field:%', patch_key using errcode = '22023';
    end if;

    if current_data -> patch_key is distinct from target_base_values -> patch_key
       and current_data -> patch_key is distinct from target_patch -> patch_key then
      insert into public.sync_conflicts (
        user_id, client_mutation_id, object_type, object_id, field_path,
        base_version, server_record_version, base_value, local_value, server_value
      ) values (
        auth.uid(), target_mutation_id, target_object_type, target_object_id, patch_key,
        target_base_version, current_version, target_base_values -> patch_key,
        target_patch -> patch_key, current_data -> patch_key
      )
      on conflict (user_id, object_type, object_id, field_path) where status = 'pending'
      do update set
        client_mutation_id = excluded.client_mutation_id,
        base_version = excluded.base_version,
        server_record_version = excluded.server_record_version,
        base_value = excluded.base_value,
        local_value = excluded.local_value,
        server_value = excluded.server_value,
        created_at = now();
      conflict_count := conflict_count + 1;
    elsif current_data -> patch_key is distinct from target_patch -> patch_key then
      safe_patch := safe_patch || jsonb_build_object(patch_key, target_patch -> patch_key);
      changed_count := changed_count + 1;
    end if;
  end loop;

  if changed_count > 0 and target_object_type = 'opportunity' then
    patched_opportunity := jsonb_populate_record(opportunity, safe_patch);
    update public.opportunities set
      company = patched_opportunity.company,
      department = patched_opportunity.department,
      role_title = patched_opportunity.role_title,
      location = patched_opportunity.location,
      work_mode = patched_opportunity.work_mode,
      deadline = patched_opportunity.deadline,
      main_stage = patched_opportunity.main_stage,
      substage = patched_opportunity.substage,
      close_reason = patched_opportunity.close_reason,
      applied_at = patched_opportunity.applied_at,
      waiting_on = patched_opportunity.waiting_on,
      record_state = patched_opportunity.record_state,
      archived_at = case when patched_opportunity.record_state = 'archived' then coalesce(opportunity.archived_at, now()) else null end,
      version = opportunity.version + 1
    where id = opportunity.id
    returning version into current_version;
  elsif changed_count > 0 and target_object_type = 'course' then
    patched_course := jsonb_populate_record(course, safe_patch);
    update public.courses set
      module = patched_course.module,
      course_code = patched_course.course_code,
      title = patched_course.title,
      starts_on = patched_course.starts_on,
      ends_on = patched_course.ends_on,
      fixed_schedule = patched_course.fixed_schedule,
      course_status = patched_course.course_status,
      next_deadline = patched_course.next_deadline,
      record_state = patched_course.record_state,
      archived_at = case when patched_course.record_state = 'archived' then coalesce(course.archived_at, now()) else null end,
      version = course.version + 1
    where id = course.id
    returning version into current_version;
  elsif changed_count > 0 and target_object_type = 'action' then
    patched_action := jsonb_populate_record(action_record, safe_patch);
    update public.actions set
      title = patched_action.title,
      due_at = patched_action.due_at,
      suggested_start_at = patched_action.suggested_start_at,
      estimated_minutes = patched_action.estimated_minutes,
      priority = patched_action.priority,
      status = patched_action.status,
      waiting_on = patched_action.waiting_on,
      completion_criteria = patched_action.completion_criteria,
      completed_at = case when patched_action.status = 'completed' then coalesce(action_record.completed_at, now()) else null end,
      cancelled_at = case when patched_action.status = 'cancelled' then coalesce(action_record.cancelled_at, now()) else null end,
      version = action_record.version + 1
    where id = action_record.id
    returning version into current_version;
  end if;

  if changed_count > 0 then
    for patch_key in select jsonb_object_keys(safe_patch)
    loop
      insert into public.field_locks (user_id, object_type, object_id, field_path, reason)
      values (auth.uid(), target_object_type, target_object_id::text, patch_key, 'user_manual_edit')
      on conflict (user_id, object_type, object_id, field_path, unlocked_at)
      do update set reason = excluded.reason, locked_at = now();
    end loop;

    insert into public.timeline_entries (
      user_id, entity_type, entity_id, event_type, actor_type, summary, changes, client_mutation_id
    ) values (
      auth.uid(), target_object_type, target_object_id, 'updated', 'user', '用户字段已更新',
      jsonb_build_object('before', current_data - array['user_id','created_at','updated_at'], 'patch', safe_patch, 'version', current_version),
      target_mutation_id
    );

    insert into public.audit_events (
      user_id, operation_id, actor_type, action, object_type, object_id,
      before_state, after_state, permission_decision, outcome
    ) values (
      auth.uid(), target_mutation_id, 'user', 'workspace.manual_update', target_object_type, target_object_id::text,
      target_base_values, safe_patch, jsonb_build_object('source', 'user_manual_edit'),
      case when conflict_count > 0 then 'partial' else 'succeeded' end
    );
  end if;

  mutation_status := case
    when conflict_count > 0 and changed_count > 0 then 'partial'
    when conflict_count > 0 then 'conflict'
    else 'applied'
  end;
  result_payload := jsonb_build_object(
    'status', mutation_status,
    'newVersion', current_version,
    'appliedFields', coalesce((select jsonb_agg(key) from jsonb_object_keys(safe_patch) as key), '[]'::jsonb),
    'conflictCount', conflict_count
  );

  insert into public.client_mutations (
    id, user_id, device_id, object_type, object_id, base_version, patch, result, status
  ) values (
    target_mutation_id, auth.uid(), target_device_id, target_object_type,
    target_object_id, target_base_version, target_patch, result_payload, mutation_status
  ) on conflict (id) do nothing;

  select result into existing_result from public.client_mutations
  where id = target_mutation_id and user_id = auth.uid();
  return coalesce(existing_result, result_payload);
end;
$$;

create or replace function public.resolve_sync_conflict(
  target_conflict_id uuid,
  target_resolution text,
  target_manual_value jsonb default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict public.sync_conflicts%rowtype;
  chosen_value jsonb;
  mutation_result jsonb;
begin
  if target_resolution not in ('use_local', 'use_server', 'manual') then
    raise exception 'invalid_conflict_resolution' using errcode = '22023';
  end if;
  if not private.m3_writes_allowed(auth.uid()) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  select * into conflict from public.sync_conflicts
  where id = target_conflict_id and user_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'conflict_not_found' using errcode = 'P0002'; end if;

  chosen_value := case target_resolution
    when 'use_local' then conflict.local_value
    when 'use_server' then conflict.server_value
    else target_manual_value
  end;
  if target_resolution = 'manual' and target_manual_value is null then
    raise exception 'manual_resolution_value_required' using errcode = '22023';
  end if;

  if target_resolution <> 'use_server' then
    mutation_result := public.apply_workspace_mutation(
      gen_random_uuid(), 'conflict-resolution', conflict.object_type, conflict.object_id,
      conflict.server_record_version,
      jsonb_build_object(conflict.field_path, conflict.server_value),
      jsonb_build_object(conflict.field_path, chosen_value)
    );
    if (mutation_result ->> 'conflictCount')::integer > 0 then
      raise exception 'conflict_changed_again' using errcode = '40001';
    end if;
  else
    mutation_result := jsonb_build_object('status', 'discarded');
  end if;

  update public.sync_conflicts set
    status = case when target_resolution = 'use_server' then 'discarded' else 'resolved' end,
    resolution = target_resolution,
    resolved_value = chosen_value,
    resolved_at = now()
  where id = conflict.id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    auth.uid(), conflict.object_type, conflict.object_id, 'conflict_resolved', 'user',
    '同步冲突已由用户明确处理',
    jsonb_build_object('field', conflict.field_path, 'resolution', target_resolution)
  );
  return mutation_result || jsonb_build_object('conflictId', conflict.id, 'resolution', target_resolution);
end;
$$;

alter table public.opportunity_candidates enable row level security;
alter table public.opportunities enable row level security;
alter table public.courses enable row level security;
alter table public.actions enable row level security;
alter table public.action_dependencies enable row level security;
alter table public.timeline_entries enable row level security;
alter table public.custom_field_definitions enable row level security;
alter table public.custom_field_values enable row level security;
alter table public.saved_views enable row level security;
alter table public.client_mutations enable row level security;
alter table public.sync_conflicts enable row level security;

create policy opportunity_candidates_select_own on public.opportunity_candidates
for select to authenticated using ((select auth.uid()) = user_id);
create policy opportunity_candidates_write_own on public.opportunity_candidates
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy opportunities_select_own on public.opportunities
for select to authenticated using ((select auth.uid()) = user_id);
create policy opportunities_write_own on public.opportunities
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy courses_select_own on public.courses
for select to authenticated using ((select auth.uid()) = user_id);
create policy courses_write_own on public.courses
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy actions_select_own on public.actions
for select to authenticated using ((select auth.uid()) = user_id);
create policy actions_write_own on public.actions
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy action_dependencies_select_own on public.action_dependencies
for select to authenticated using ((select auth.uid()) = user_id);
create policy action_dependencies_write_own on public.action_dependencies
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy timeline_entries_select_own on public.timeline_entries
for select to authenticated using ((select auth.uid()) = user_id);
create policy timeline_entries_write_own on public.timeline_entries
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy custom_field_definitions_select_own on public.custom_field_definitions
for select to authenticated using ((select auth.uid()) = user_id);
create policy custom_field_definitions_write_own on public.custom_field_definitions
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy custom_field_values_select_own on public.custom_field_values
for select to authenticated using ((select auth.uid()) = user_id);
create policy custom_field_values_write_own on public.custom_field_values
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy saved_views_select_own on public.saved_views
for select to authenticated using ((select auth.uid()) = user_id);
create policy saved_views_write_own on public.saved_views
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy client_mutations_select_own on public.client_mutations
for select to authenticated using ((select auth.uid()) = user_id);
create policy client_mutations_write_own on public.client_mutations
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

create policy sync_conflicts_select_own on public.sync_conflicts
for select to authenticated using ((select auth.uid()) = user_id);
create policy sync_conflicts_write_own on public.sync_conflicts
for all to authenticated
using (private.m3_writes_allowed(user_id))
with check (private.m3_writes_allowed(user_id));

revoke all on
  public.opportunity_candidates, public.opportunities, public.courses,
  public.actions, public.action_dependencies, public.timeline_entries,
  public.custom_field_definitions, public.custom_field_values, public.saved_views,
  public.client_mutations, public.sync_conflicts
from anon, authenticated;

grant select, insert, update, delete on
  public.opportunity_candidates, public.opportunities, public.courses,
  public.actions, public.action_dependencies, public.timeline_entries,
  public.custom_field_definitions, public.custom_field_values, public.saved_views,
  public.client_mutations, public.sync_conflicts
to authenticated;

grant all on
  public.opportunity_candidates, public.opportunities, public.courses,
  public.actions, public.action_dependencies, public.timeline_entries,
  public.custom_field_definitions, public.custom_field_values, public.saved_views,
  public.client_mutations, public.sync_conflicts
to service_role;

revoke execute on function public.promote_opportunity_candidate(uuid, text) from public, anon;
revoke execute on function public.apply_workspace_mutation(uuid, text, text, uuid, bigint, jsonb, jsonb) from public, anon;
revoke execute on function public.resolve_sync_conflict(uuid, text, jsonb) from public, anon;
grant execute on function public.promote_opportunity_candidate(uuid, text) to authenticated, service_role;
grant execute on function public.apply_workspace_mutation(uuid, text, text, uuid, bigint, jsonb, jsonb) to authenticated, service_role;
grant execute on function public.resolve_sync_conflict(uuid, text, jsonb) to authenticated, service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

alter publication supabase_realtime add table
  public.opportunity_candidates, public.opportunities, public.courses,
  public.actions, public.timeline_entries, public.sync_conflicts;
