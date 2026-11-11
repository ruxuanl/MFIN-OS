-- M7 first safe slice: allowlisted WeChat monitor health, private cursors, and
-- atomic storage of an already-local-sanitized JD projection. No raw screenshot,
-- complete chat, sender profile, WeChat credential, or client-control primitive
-- is represented in this schema.

insert into public.capability_definitions (
  capability_key, category, label, description, risk_level,
  requires_ai, supports_once, supports_timed, connection_provider, requires_reverification
) values (
  'wechat.monitor', 'wechat', '微信白名单群监测',
  '低频读取已确认白名单群的可见界面；本地净化后只上传 JD 最小投影。',
  'high', false, true, true, null, false
) on conflict (capability_key) do nothing;

insert into public.capability_dependencies (capability_key, required_capability_key)
values
  ('wechat.monitor', 'wechat.local_sanitize'),
  ('wechat.monitor', 'job_radar.discovery')
on conflict do nothing;

create table public.wechat_allowlist_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stable_group_key text not null check (stable_group_key ~ '^[0-9a-f]{64}$'),
  identity_fingerprint text not null check (identity_fingerprint ~ '^[0-9a-f]{64}$'),
  display_label text not null check (length(display_label) between 1 and 120),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, stable_group_key),
  unique (id, user_id)
);

create table public.wechat_monitor_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  desired_state text not null default 'stopped'
    check (desired_state in ('stopped', 'running', 'paused')),
  observed_state text not null default 'stopped'
    check (observed_state in ('stopped', 'healthy', 'paused', 'blocked', 'error')),
  stop_generation bigint not null default 0 check (stop_generation >= 0),
  pause_reason text check (
    pause_reason is null or pause_reason in (
      'user_paused', 'privacy_locked', 'permission_denied', 'session_locked',
      'wechat_logged_out', 'window_unavailable', 'group_identity_uncertain',
      'ui_changed', 'account_risk', 'ocr_failed', 'network_unavailable',
      'heartbeat_expired', 'not_configured'
    )
  ),
  last_heartbeat_at timestamptz,
  last_success_at timestamptz,
  last_error_code text check (last_error_code is null or length(last_error_code) <= 120),
  monitor_version text check (monitor_version is null or length(monitor_version) <= 80),
  environment_summary jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wechat_monitor_environment_object
    check (jsonb_typeof(environment_summary) = 'object' and pg_column_size(environment_summary) <= 4096),
  constraint wechat_monitor_health_shape check (
    (observed_state = 'healthy' and desired_state = 'running' and pause_reason is null)
    or observed_state <> 'healthy'
  )
);

create table private.wechat_scan_cursors (
  allowlist_group_id uuid primary key references public.wechat_allowlist_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_capture_key text not null check (length(last_capture_key) between 1 and 240),
  last_content_hash text check (last_content_hash is null or last_content_hash ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default now(),
  unique (allowlist_group_id, user_id),
  constraint wechat_cursor_group_owner_fk
    foreign key (allowlist_group_id, user_id)
    references public.wechat_allowlist_groups(id, user_id) on delete cascade
);

create table public.wechat_projections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  allowlist_group_id uuid not null,
  capture_key text not null check (length(capture_key) between 1 and 240),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  source_kind text not null check (source_kind in ('text', 'image', 'link')),
  track text not null check (track in ('internship', 'graduate')),
  company text not null check (length(company) between 1 and 240),
  role_title text not null check (length(role_title) between 1 and 240),
  location text check (location is null or length(location) <= 240),
  deadline date,
  evidence_excerpt text not null check (length(evidence_excerpt) between 1 and 1000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  rule_version text not null default 'wechat_rules_v1' check (rule_version = 'wechat_rules_v1'),
  processing_status text not null check (processing_status in ('candidate', 'pending')),
  evidence_id uuid not null references public.evidence_refs(id) on delete restrict,
  candidate_id uuid references public.opportunity_candidates(id) on delete set null,
  inbox_item_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, allowlist_group_id, capture_key),
  constraint wechat_projection_group_owner_fk
    foreign key (allowlist_group_id, user_id)
    references public.wechat_allowlist_groups(id, user_id) on delete restrict,
  constraint wechat_projection_candidate_shape check (
    (processing_status = 'candidate' and candidate_id is not null)
    or (processing_status = 'pending' and candidate_id is null)
  )
);

alter table public.inbox_items alter column gmail_message_id drop not null;
alter table public.inbox_items add column wechat_projection_id uuid;
alter table public.inbox_items drop constraint inbox_items_item_type_check;
alter table public.inbox_items add constraint inbox_items_item_type_check
  check (item_type in (
    'email_action', 'email_update', 'email_information', 'attachment',
    'wechat_candidate', 'wechat_pending'
  ));
alter table public.inbox_items add constraint inbox_items_exactly_one_source check (
  (gmail_message_id is not null and wechat_projection_id is null)
  or (gmail_message_id is null and wechat_projection_id is not null)
);
alter table public.wechat_projections add constraint wechat_projection_inbox_fk
  foreign key (inbox_item_id) references public.inbox_items(id) on delete set null;
alter table public.inbox_items add constraint inbox_wechat_projection_fk
  foreign key (wechat_projection_id) references public.wechat_projections(id) on delete cascade;

create index wechat_allowlist_user_enabled_idx
  on public.wechat_allowlist_groups (user_id, enabled);
create index wechat_projections_group_captured_idx
  on public.wechat_projections (allowlist_group_id, captured_at desc);
create index wechat_projections_user_status_idx
  on public.wechat_projections (user_id, processing_status, captured_at desc);
create index wechat_projections_candidate_idx
  on public.wechat_projections (candidate_id) where candidate_id is not null;
create index wechat_projections_evidence_idx
  on public.wechat_projections (evidence_id);
create unique index wechat_projections_inbox_idx
  on public.wechat_projections (inbox_item_id) where inbox_item_id is not null;
create unique index inbox_items_wechat_projection_unique_idx
  on public.inbox_items (wechat_projection_id) where wechat_projection_id is not null;
create index wechat_scan_cursors_user_idx
  on private.wechat_scan_cursors (user_id);

create trigger wechat_allowlist_set_updated_at before update on public.wechat_allowlist_groups
for each row execute function private.set_updated_at();
create trigger wechat_monitor_state_set_updated_at before update on public.wechat_monitor_states
for each row execute function private.set_updated_at();

create or replace function public.store_wechat_projection(
  target_user_id uuid,
  target_allowlist_group_id uuid,
  target_identity_fingerprint text,
  target_capture_key text,
  target_content_hash text,
  target_captured_at timestamptz,
  target_source_kind text,
  target_track text,
  target_company text,
  target_role_title text,
  target_location text,
  target_deadline date,
  target_evidence_excerpt text,
  target_confidence numeric,
  target_stop_generation bigint
)
returns table (wechat_projection_id uuid, inbox_item_id uuid, candidate_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  decision record;
  group_record public.wechat_allowlist_groups%rowtype;
  monitor_record public.wechat_monitor_states%rowtype;
  existing_projection public.wechat_projections%rowtype;
  new_evidence_id uuid;
  new_projection_id uuid;
  new_candidate_id uuid;
  new_inbox_id uuid;
  projection_status text;
begin
  select * into decision
  from private.evaluate_permission(target_user_id, 'wechat.monitor', null);
  if not decision.allowed then
    raise exception 'wechat_monitor_permission_denied:%', decision.reason using errcode = '42501';
  end if;

  select * into group_record
  from public.wechat_allowlist_groups
  where id = target_allowlist_group_id and user_id = target_user_id and enabled
  for share;
  if not found or group_record.identity_fingerprint <> target_identity_fingerprint then
    raise exception 'wechat_group_identity_unconfirmed' using errcode = '42501';
  end if;

  select * into monitor_record
  from public.wechat_monitor_states
  where user_id = target_user_id
  for share;
  if not found
    or monitor_record.desired_state <> 'running'
    or monitor_record.observed_state <> 'healthy'
    or monitor_record.stop_generation <> target_stop_generation
    or monitor_record.last_heartbeat_at is null
    or monitor_record.last_heartbeat_at < now() - interval '2 minutes'
  then
    raise exception 'wechat_monitor_not_healthy' using errcode = '42501';
  end if;

  select * into existing_projection
  from public.wechat_projections
  where user_id = target_user_id
    and allowlist_group_id = target_allowlist_group_id
    and capture_key = target_capture_key;
  if found then
    return query select existing_projection.id, existing_projection.inbox_item_id,
      existing_projection.candidate_id, false;
    return;
  end if;

  projection_status := case when target_confidence >= 0.900 then 'candidate' else 'pending' end;

  insert into public.evidence_refs (
    user_id, source_type, source_locator, content_hash, summary, last_verified_at
  ) values (
    target_user_id, 'wechat', 'wechat-group:' || group_record.stable_group_key,
    target_content_hash, target_evidence_excerpt, now()
  ) returning id into new_evidence_id;

  if projection_status = 'candidate' then
    insert into public.opportunity_candidates (
      user_id, track, company, role_title, location, deadline,
      source_summary, discovered_at, last_verified_at
    ) values (
      target_user_id, target_track, target_company, target_role_title,
      target_location, target_deadline, target_evidence_excerpt,
      target_captured_at, now()
    ) returning id into new_candidate_id;
  end if;

  insert into public.wechat_projections (
    user_id, allowlist_group_id, capture_key, content_hash, captured_at,
    source_kind, track, company, role_title, location, deadline,
    evidence_excerpt, confidence, processing_status, evidence_id, candidate_id
  ) values (
    target_user_id, target_allowlist_group_id, target_capture_key,
    target_content_hash, target_captured_at, target_source_kind, target_track,
    target_company, target_role_title, target_location, target_deadline,
    target_evidence_excerpt, target_confidence, projection_status,
    new_evidence_id, new_candidate_id
  ) returning id into new_projection_id;

  insert into public.inbox_items (
    user_id, gmail_message_id, wechat_projection_id, item_type, classification,
    title, summary, confidence, evidence_id
  ) values (
    target_user_id, null, new_projection_id,
    case when projection_status = 'candidate' then 'wechat_candidate' else 'wechat_pending' end,
    case when projection_status = 'candidate' then 'job' else 'pending' end,
    target_company || '｜' || target_role_title, target_evidence_excerpt,
    target_confidence, new_evidence_id
  ) returning id into new_inbox_id;

  update public.wechat_projections set inbox_item_id = new_inbox_id where id = new_projection_id;

  if new_candidate_id is not null then
    insert into public.timeline_entries (
      user_id, entity_type, entity_id, event_type, actor_type, summary, changes
    ) values (
      target_user_id, 'candidate', new_candidate_id, 'wechat.discovered', 'sync',
      '微信白名单群发现候选岗位',
      jsonb_build_object('projection_id', new_projection_id, 'rule_version', 'wechat_rules_v1')
    );
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'wechat.projection_stored', 'wechat_projection', new_projection_id::text,
    jsonb_build_object('processing_status', projection_status, 'candidate_id', new_candidate_id),
    jsonb_build_object('allowed', true, 'grant_id', decision.grant_id,
      'allowlist_group_id', target_allowlist_group_id), 'succeeded'
  );

  insert into private.wechat_scan_cursors (
    allowlist_group_id, user_id, last_capture_key, last_content_hash
  ) values (
    target_allowlist_group_id, target_user_id, target_capture_key, target_content_hash
  ) on conflict (allowlist_group_id) do update set
    last_capture_key = excluded.last_capture_key,
    last_content_hash = excluded.last_content_hash,
    updated_at = now();

  update public.wechat_monitor_states
  set last_success_at = now(), last_error_code = null
  where user_id = target_user_id and stop_generation = target_stop_generation;

  return query select new_projection_id, new_inbox_id, new_candidate_id, true;
end;
$$;

alter table public.wechat_allowlist_groups enable row level security;
alter table public.wechat_monitor_states enable row level security;
alter table public.wechat_projections enable row level security;
alter table private.wechat_scan_cursors enable row level security;

create policy wechat_allowlist_read_own on public.wechat_allowlist_groups
for select to authenticated using ((select auth.uid()) = user_id);
create policy wechat_monitor_state_read_own on public.wechat_monitor_states
for select to authenticated using ((select auth.uid()) = user_id);
create policy wechat_projections_read_own on public.wechat_projections
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.wechat_allowlist_groups, public.wechat_monitor_states,
  public.wechat_projections from anon, authenticated;
grant select on public.wechat_allowlist_groups, public.wechat_monitor_states,
  public.wechat_projections to authenticated;
grant all on public.wechat_allowlist_groups, public.wechat_monitor_states,
  public.wechat_projections to service_role;

revoke execute on function public.store_wechat_projection(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text,
  text, date, text, numeric, bigint
) from public, anon, authenticated;
grant execute on function public.store_wechat_projection(
  uuid, uuid, text, text, text, timestamptz, text, text, text, text,
  text, date, text, numeric, bigint
) to service_role;

revoke all on private.wechat_scan_cursors from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
