-- M6: independent read-only Gmail connection, bounded incremental sync,
-- minimal communication records, unified inbox, attachment staging metadata,
-- and reversible deterministic updates. Browser clients receive read-only
-- table access; all system-owned mutations run through service-only paths.

insert into public.capability_definitions (
  capability_key, category, label, description, risk_level,
  requires_ai, supports_once, supports_timed, connection_provider, requires_reverification
) values (
  'gmail.rules_extract', 'gmail', '规则邮件提取',
  '使用明确标注为非 AI 的确定性规则提取必要摘要、行动和日期。',
  'high', false, true, true, 'gmail', false
) on conflict (capability_key) do nothing;

insert into public.capability_dependencies (capability_key, required_capability_key)
values ('gmail.rules_extract', 'gmail.sync')
on conflict do nothing;

insert into public.capability_definitions (
  capability_key, category, label, description, risk_level,
  requires_ai, supports_once, supports_timed, connection_provider, requires_reverification
) values (
  'gmail.rules_status_update', 'gmail', '规则状态更新',
  '仅在邮件证据明确且唯一匹配现有岗位时更新状态；保留撤销。',
  'high', false, true, true, 'gmail', false
) on conflict (capability_key) do nothing;

insert into public.capability_dependencies (capability_key, required_capability_key)
values ('gmail.rules_status_update', 'gmail.rules_extract')
on conflict do nothing;

create table private.gmail_sync_cursors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  history_id text not null check (history_id ~ '^[0-9]+$'),
  initial_query text not null default 'in:inbox newer_than:30d'
    check (length(initial_query) between 1 and 200),
  last_full_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.gmail_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  provider_thread_id text not null check (length(provider_thread_id) between 1 and 200),
  history_id text not null check (history_id ~ '^[0-9]+$'),
  received_at timestamptz not null,
  source_identity text not null default 'unknown'
    check (source_identity in ('job_forward', 'personal_forward', 'academic_forward', 'gmail', 'unknown')),
  classification text not null
    check (classification in ('job', 'academic', 'personal', 'irrelevant', 'pending')),
  sender_summary text check (sender_summary is null or length(sender_summary) <= 320),
  subject text not null default '' check (length(subject) <= 500),
  summary text check (summary is null or length(summary) <= 2000),
  gmail_link text not null check (length(gmail_link) <= 2048),
  needs_action boolean not null default false,
  action_title text check (action_title is null or length(action_title) <= 300),
  action_due_at timestamptz,
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  rule_version text not null default 'mail_rules_v1' check (rule_version = 'mail_rules_v1'),
  processing_status text not null default 'processed'
    check (processing_status in ('processed', 'pending', 'ignored', 'failed')),
  evidence_id uuid references public.evidence_refs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_message_id),
  constraint gmail_message_action_shape check (
    (needs_action and action_title is not null) or (not needs_action and action_title is null)
  )
);

create table public.inbox_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id uuid not null references public.gmail_messages(id) on delete cascade,
  item_type text not null
    check (item_type in ('email_action', 'email_update', 'email_information', 'attachment')),
  classification text not null check (classification in ('job', 'academic', 'personal', 'pending')),
  title text not null check (length(title) between 1 and 500),
  summary text not null check (length(summary) between 1 and 2000),
  confidence numeric(4,3) not null check (confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'dismissed', 'auto_applied')),
  target_type text check (target_type is null or target_type in ('opportunity', 'course', 'personal')),
  target_id uuid,
  evidence_id uuid references public.evidence_refs(id) on delete set null,
  action_id uuid references public.actions(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gmail_message_id, item_type),
  constraint inbox_resolution_shape check (
    (status = 'pending' and resolved_at is null)
    or (status <> 'pending' and resolved_at is not null)
  ),
  constraint inbox_target_shape check (
    (target_type is null and target_id is null)
    or (target_type is not null and (target_type = 'personal' or target_id is not null))
  )
);

create table public.gmail_attachments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gmail_message_id uuid not null references public.gmail_messages(id) on delete cascade,
  provider_attachment_id text not null check (length(provider_attachment_id) between 1 and 300),
  filename text not null check (length(filename) between 1 and 500),
  mime_type text not null check (length(mime_type) between 1 and 200),
  size_bytes bigint not null check (size_bytes between 0 and 10485760),
  content_sha256 text check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text check (storage_path is null or length(storage_path) <= 1000),
  import_status text not null default 'link_only'
    check (import_status in ('link_only', 'pending', 'imported', 'deleted', 'failed')),
  failure_code text check (failure_code is null or length(failure_code) <= 120),
  imported_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_attachment_id),
  constraint gmail_attachment_state_shape check (
    (import_status = 'imported' and storage_path is not null and imported_at is not null and deleted_at is null)
    or (import_status = 'deleted' and storage_path is null and deleted_at is not null)
    or (import_status in ('link_only', 'pending', 'failed') and storage_path is null and imported_at is null and deleted_at is null)
  )
);

create table public.gmail_updates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inbox_item_id uuid not null unique references public.inbox_items(id) on delete cascade,
  update_type text not null check (update_type = 'interview_invitation'),
  opportunity_id uuid not null references public.opportunities(id) on delete restrict,
  previous_main_stage text not null,
  previous_substage text,
  action_id uuid references public.actions(id) on delete set null,
  calendar_operation_id uuid references public.calendar_sync_operations(id) on delete set null,
  audit_event_id uuid not null references public.audit_events(id) on delete restrict,
  undo_operation_id uuid references public.undo_operations(id) on delete set null,
  status text not null default 'applied' check (status in ('applied', 'undone')),
  applied_at timestamptz not null default now(),
  undone_at timestamptz,
  constraint gmail_update_state_shape check (
    (status = 'applied' and undone_at is null) or (status = 'undone' and undone_at is not null)
  )
);

create index gmail_messages_user_received_idx
  on public.gmail_messages (user_id, received_at desc);
create index gmail_messages_classification_idx
  on public.gmail_messages (user_id, classification, processing_status, received_at desc);
create index inbox_items_user_status_idx
  on public.inbox_items (user_id, status, created_at desc);
create index gmail_attachments_message_idx
  on public.gmail_attachments (gmail_message_id, import_status);
create index gmail_updates_user_status_idx
  on public.gmail_updates (user_id, status, applied_at desc);
create index gmail_updates_opportunity_idx
  on public.gmail_updates (opportunity_id, applied_at desc);

create trigger gmail_messages_set_updated_at before update on public.gmail_messages
for each row execute function private.set_updated_at();
create trigger inbox_items_set_updated_at before update on public.inbox_items
for each row execute function private.set_updated_at();
create trigger gmail_attachments_set_updated_at before update on public.gmail_attachments
for each row execute function private.set_updated_at();

create or replace function public.set_my_gmail_connection_status(target_status text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection_record public.external_connections%rowtype;
begin
  if target_status not in ('connected', 'paused') then
    raise exception 'invalid_gmail_connection_status' using errcode = '22023';
  end if;
  if target_status = 'connected' and exists (
    select 1 from public.privacy_locks where user_id = auth.uid() and is_locked
  ) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into connection_record from public.external_connections
  where user_id = auth.uid() and provider = 'gmail' for update;
  if not found or connection_record.secret_reference_id is null then
    raise exception 'gmail_not_authorized' using errcode = '42501';
  end if;
  update public.external_connections
  set status = target_status, last_error_code = null, last_error_at = null
  where id = connection_record.id;
  update public.automation_runs
  set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
      finished_at = case when status = 'queued' then now() else finished_at end,
      safe_checkpoint = 'gmail_connection_' || target_status
  where user_id = auth.uid() and capability_key in ('gmail.sync', 'gmail.rules_extract')
    and status in ('queued', 'running') and target_status = 'paused';
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'gmail.connection_' || target_status,
    'external_connection', connection_record.id::text,
    jsonb_build_object('status', target_status),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );
  return target_status;
end;
$$;

create or replace function public.resolve_my_inbox_item(target_item_id uuid, target_resolution text)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  item_record public.inbox_items%rowtype;
  new_action_id uuid;
begin
  if target_resolution not in ('accept', 'dismiss') then
    raise exception 'invalid_inbox_resolution' using errcode = '22023';
  end if;
  if exists (select 1 from public.privacy_locks where user_id = auth.uid() and is_locked) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into item_record from public.inbox_items
  where id = target_item_id and user_id = auth.uid() and status = 'pending'
  for update;
  if not found then raise exception 'inbox_item_not_found' using errcode = 'P0002'; end if;

  if target_resolution = 'accept' and item_record.item_type = 'email_action' then
    insert into public.actions (
      user_id, context_type, context_id, track, title, due_at,
      priority, status, waiting_on, completion_criteria
    ) values (
      auth.uid(),
      case when item_record.target_type in ('opportunity', 'course') then item_record.target_type else 'personal' end,
      case when item_record.target_type in ('opportunity', 'course') then item_record.target_id else null end,
      case
        when item_record.target_type = 'opportunity' then (select track from public.opportunities where id = item_record.target_id and user_id = auth.uid())
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
      auth.uid(), 'action', new_action_id, 'gmail_action_confirmed', 'user',
      '用户确认从邮件创建行动', jsonb_build_object('inbox_item_id', item_record.id)
    );
  end if;

  update public.inbox_items
  set status = case when target_resolution = 'accept' then 'accepted' else 'dismissed' end,
      action_id = new_action_id, resolved_at = now()
  where id = item_record.id;
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'gmail.inbox_' || target_resolution,
    'inbox_item', item_record.id::text,
    jsonb_build_object('status', target_resolution, 'action_id', new_action_id),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );
  return new_action_id;
end;
$$;

create or replace function public.undo_my_gmail_update(target_update_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  update_record public.gmail_updates%rowtype;
begin
  if exists (select 1 from public.privacy_locks where user_id = auth.uid() and is_locked) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  select * into update_record from public.gmail_updates
  where id = target_update_id and user_id = auth.uid() and status = 'applied'
  for update;
  if not found then raise exception 'gmail_update_not_found' using errcode = 'P0002'; end if;

  update public.opportunities
  set main_stage = update_record.previous_main_stage,
      substage = update_record.previous_substage,
      version = version + 1
  where id = update_record.opportunity_id and user_id = auth.uid();
  if update_record.action_id is not null then
    update public.actions
    set status = 'cancelled', cancelled_at = now(), completed_at = null, version = version + 1
    where id = update_record.action_id and user_id = auth.uid() and status not in ('completed', 'cancelled');
  end if;
  if update_record.calendar_operation_id is not null then
    update public.calendar_sync_operations
    set status = 'cancelled', finished_at = now(), blocked_reason = 'gmail_update_undone'
    where id = update_record.calendar_operation_id and user_id = auth.uid() and status = 'pending';
  end if;
  update public.gmail_updates set status = 'undone', undone_at = now() where id = update_record.id;
  update public.undo_operations
  set status = 'succeeded', attempted_at = now(), completed_at = now(),
      result_summary = 'Gmail 自动状态更新已撤销'
  where id = update_record.undo_operation_id and user_id = auth.uid();
  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    auth.uid(), 'opportunity', update_record.opportunity_id,
    'gmail_update_undone', 'user', '用户撤销 Gmail 自动状态更新',
    jsonb_build_object('gmail_update_id', update_record.id)
  );
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'gmail.update_undone', 'gmail_update', update_record.id::text,
    jsonb_build_object('restored_stage', update_record.previous_main_stage),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );
  return true;
end;
$$;

create or replace function public.apply_gmail_interview_update(
  target_user_id uuid,
  target_inbox_item_id uuid,
  target_opportunity_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_record public.inbox_items%rowtype;
  message_record public.gmail_messages%rowtype;
  opportunity_record public.opportunities%rowtype;
  status_decision record;
  calendar_decision record;
  notification_decision record;
  created_action_id uuid;
  event_link_id uuid;
  calendar_operation_id uuid;
  audit_id uuid;
  undo_id uuid;
  update_id uuid;
begin
  select * into status_decision
  from private.evaluate_permission(target_user_id, 'gmail.rules_status_update', null);
  if not coalesce(status_decision.allowed, false) then
    raise exception 'gmail_status_update_denied:%', coalesce(status_decision.reason, 'unknown') using errcode = '42501';
  end if;
  select * into item_record from public.inbox_items
  where id = target_inbox_item_id and user_id = target_user_id
    and status = 'pending' and item_type = 'email_update'
  for update;
  if not found then raise exception 'gmail_inbox_item_not_found' using errcode = 'P0002'; end if;
  select * into message_record from public.gmail_messages
  where id = item_record.gmail_message_id and user_id = target_user_id;
  if message_record.classification <> 'job' or message_record.confidence < 0.98
     or message_record.action_due_at is null or item_record.target_id is distinct from target_opportunity_id then
    raise exception 'gmail_interview_not_high_confidence' using errcode = '42501';
  end if;
  select * into opportunity_record from public.opportunities
  where id = target_opportunity_id and user_id = target_user_id and record_state = 'active'
  for update;
  if not found then raise exception 'gmail_opportunity_not_found' using errcode = 'P0002'; end if;

  update public.opportunities
  set main_stage = 'interview', substage = '面试（邮件）', version = version + 1
  where id = opportunity_record.id;

  insert into public.actions (
    user_id, context_type, context_id, track, title, due_at, suggested_start_at,
    estimated_minutes, priority, status, waiting_on, completion_criteria
  ) values (
    target_user_id, 'opportunity', opportunity_record.id, opportunity_record.track,
    '参加面试：' || opportunity_record.company || ' · ' || opportunity_record.role_title,
    message_record.action_due_at, message_record.action_due_at,
    60, 'critical', 'scheduled', 'user', '参加邮件确认的面试并记录结果'
  ) returning id into created_action_id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    target_user_id, 'opportunity', opportunity_record.id, 'gmail_interview_detected', 'sync',
    'Gmail 明确面试邀请已更新岗位状态',
    jsonb_build_object('from_stage', opportunity_record.main_stage, 'to_stage', 'interview',
      'inbox_item_id', item_record.id, 'action_id', created_action_id, 'rule_version', 'mail_rules_v1')
  );

  select * into calendar_decision
  from private.evaluate_permission(target_user_id, 'calendar.write_fact', null);
  if coalesce(calendar_decision.allowed, false) then
    insert into public.calendar_event_links (
      user_id, action_id, category, all_day,
      scheduled_start_at, scheduled_end_at, sync_status
    ) values (
      target_user_id, created_action_id,
      case when opportunity_record.track = 'graduate' then 'graduate' else 'internship' end,
      false, message_record.action_due_at, message_record.action_due_at + interval '1 hour', 'pending'
    ) returning id into event_link_id;
    insert into public.calendar_sync_operations (
      user_id, event_link_id, idempotency_key, operation_type,
      capability_key, target_action_version
    ) values (
      target_user_id, event_link_id, 'gmail-interview:' || item_record.id::text,
      'create', 'calendar.write_fact', 1
    ) returning id into calendar_operation_id;
  end if;

  select * into notification_decision
  from private.evaluate_permission(target_user_id, 'notifications.smart_push', null);
  if coalesce(notification_decision.allowed, false) then
    insert into public.notifications (
      user_id, notification_type, dedupe_key, title, body, target_path, reason
    ) values (
      target_user_id, 'interview_invitation', 'gmail-interview:' || message_record.provider_message_id,
      '收到面试邀请', opportunity_record.company || ' · ' || opportunity_record.role_title,
      '/inbox', 'Gmail 明确面试邀请 · mail_rules_v1'
    ) on conflict (user_id, dedupe_key) do nothing;
  end if;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    before_state, after_state, permission_decision, rule_version,
    confidence, outcome, reversible, undo_deadline
  ) values (
    target_user_id, 'sync', 'gmail.interview_auto_applied', 'opportunity', opportunity_record.id::text,
    jsonb_build_object('main_stage', opportunity_record.main_stage, 'substage', opportunity_record.substage),
    jsonb_build_object('main_stage', 'interview', 'substage', '面试（邮件）',
      'action_id', created_action_id, 'calendar_operation_id', calendar_operation_id),
    jsonb_build_object('status_update', status_decision.reason,
      'calendar', coalesce(calendar_decision.reason, 'not_evaluated'),
      'notification', coalesce(notification_decision.reason, 'not_evaluated')),
    'mail_rules_v1', message_record.confidence, 'succeeded', true, now() + interval '30 days'
  ) returning id into audit_id;
  if item_record.evidence_id is not null then
    insert into public.audit_event_evidence (audit_event_id, evidence_id)
    values (audit_id, item_record.evidence_id);
  end if;
  insert into public.undo_operations (
    user_id, audit_event_id, operation_type, compensation_payload, expires_at
  ) values (
    target_user_id, audit_id, 'gmail_interview_update',
    jsonb_build_object('opportunity_id', opportunity_record.id,
      'previous_main_stage', opportunity_record.main_stage,
      'previous_substage', opportunity_record.substage,
      'action_id', created_action_id, 'calendar_operation_id', calendar_operation_id),
    now() + interval '30 days'
  ) returning id into undo_id;
  update public.inbox_items
  set status = 'auto_applied', target_type = 'opportunity', target_id = opportunity_record.id,
      action_id = created_action_id, resolved_at = now()
  where id = item_record.id;
  insert into public.gmail_updates (
    user_id, inbox_item_id, update_type, opportunity_id,
    previous_main_stage, previous_substage, action_id,
    calendar_operation_id, audit_event_id, undo_operation_id
  ) values (
    target_user_id, item_record.id, 'interview_invitation', opportunity_record.id,
    opportunity_record.main_stage, opportunity_record.substage, created_action_id,
    calendar_operation_id, audit_id, undo_id
  ) returning id into update_id;
  return update_id;
end;
$$;

create or replace function public.store_gmail_oauth_credentials(
  target_user_id uuid,
  target_secret_payload text,
  target_scopes text[],
  target_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_record private.secret_references%rowtype;
  vault_id uuid;
  connection_id uuid;
  readonly_scope constant text := 'https://www.googleapis.com/auth/gmail.readonly';
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if target_scopes <> array[readonly_scope]::text[] then
    raise exception 'gmail_scope_not_readonly' using errcode = '42501';
  end if;
  if length(target_secret_payload) > 16384 then
    raise exception 'gmail_secret_too_large' using errcode = '22023';
  end if;
  select * into secret_record from private.secret_references
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials'
  for update;
  if found and secret_record.vault_secret_id is not null then
    perform vault.update_secret(
      secret_record.vault_secret_id, target_secret_payload,
      'gmail-oauth-' || target_user_id::text,
      'Read-only Gmail OAuth credentials for isolated personal system', null
    );
    vault_id := secret_record.vault_secret_id;
    update private.secret_references set disabled_at = null, rotated_at = now()
    where id = secret_record.id;
  else
    vault_id := vault.create_secret(
      target_secret_payload, 'gmail-oauth-' || target_user_id::text,
      'Read-only Gmail OAuth credentials for isolated personal system'
    );
    insert into private.secret_references (
      user_id, provider, secret_name, vault_secret_id, rotated_at, disabled_at
    ) values (target_user_id, 'gmail', 'oauth_credentials', vault_id, now(), null)
    on conflict (user_id, provider, secret_name) do update set
      vault_secret_id = excluded.vault_secret_id, rotated_at = now(), disabled_at = null;
  end if;
  select id into secret_record.id from private.secret_references
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials';
  insert into public.external_connections (
    user_id, provider, status, granted_scopes, secret_reference_id,
    last_success_at, last_error_code, last_error_at
  ) values (
    target_user_id, 'gmail', 'connected', target_scopes, secret_record.id,
    now(), null, null
  ) on conflict (user_id, provider) do update set
    status = 'connected', granted_scopes = excluded.granted_scopes,
    secret_reference_id = excluded.secret_reference_id,
    last_success_at = now(), last_error_code = null, last_error_at = null
  returning id into connection_id;
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'gmail.connected', 'external_connection', connection_id::text,
    jsonb_build_object('status', 'connected', 'scopes', target_scopes, 'expires_at', target_expires_at),
    jsonb_build_object('credential_storage', 'supabase_vault', 'read_only', true), 'succeeded'
  );
  return connection_id;
end;
$$;

create or replace function public.read_gmail_oauth_credentials(target_user_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select ds.decrypted_secret
  from private.secret_references sr
  join vault.decrypted_secrets ds on ds.id = sr.vault_secret_id
  where sr.user_id = target_user_id and sr.provider = 'gmail'
    and sr.secret_name = 'oauth_credentials' and sr.disabled_at is null;
$$;

create or replace function public.delete_gmail_oauth_credentials(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare vault_id uuid;
begin
  select vault_secret_id into vault_id from private.secret_references
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials'
  for update;
  if vault_id is not null then delete from vault.secrets where id = vault_id; end if;
  update private.secret_references set vault_secret_id = null, disabled_at = now()
  where user_id = target_user_id and provider = 'gmail' and secret_name = 'oauth_credentials';
  update public.external_connections
  set status = 'disconnected', secret_reference_id = null,
      last_error_code = null, last_error_at = null
  where user_id = target_user_id and provider = 'gmail';
  update public.automation_runs
  set status = case when status = 'queued' then 'cancelled' else 'cancel_requested' end,
      finished_at = case when status = 'queued' then now() else finished_at end,
      safe_checkpoint = 'gmail_disconnected'
  where user_id = target_user_id and capability_key in ('gmail.sync', 'gmail.rules_extract')
    and status in ('queued', 'running');
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'gmail.disconnected', 'external_connection', target_user_id::text,
    jsonb_build_object('status', 'disconnected'),
    jsonb_build_object('credential_deleted', vault_id is not null), 'succeeded'
  );
  return vault_id is not null;
end;
$$;

create or replace function public.get_gmail_sync_cursor(target_user_id uuid)
returns table (history_id text, initial_query text, last_full_sync_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.history_id, c.initial_query, c.last_full_sync_at
  from private.gmail_sync_cursors c where c.user_id = target_user_id;
$$;

create or replace function public.set_gmail_sync_cursor(
  target_user_id uuid, target_history_id text, target_full_sync boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if target_history_id !~ '^[0-9]+$' then
    raise exception 'invalid_gmail_history_id' using errcode = '22023';
  end if;
  insert into private.gmail_sync_cursors (user_id, history_id, last_full_sync_at)
  values (target_user_id, target_history_id, case when target_full_sync then now() else null end)
  on conflict (user_id) do update set
    history_id = excluded.history_id,
    last_full_sync_at = case when target_full_sync then now() else private.gmail_sync_cursors.last_full_sync_at end,
    updated_at = now();
end;
$$;

alter table public.gmail_messages enable row level security;
alter table public.inbox_items enable row level security;
alter table public.gmail_attachments enable row level security;
alter table public.gmail_updates enable row level security;
alter table private.gmail_sync_cursors enable row level security;

create policy gmail_messages_read_own on public.gmail_messages
for select to authenticated using ((select auth.uid()) = user_id);
create policy inbox_items_read_own on public.inbox_items
for select to authenticated using ((select auth.uid()) = user_id);
create policy gmail_attachments_read_own on public.gmail_attachments
for select to authenticated using ((select auth.uid()) = user_id);
create policy gmail_updates_read_own on public.gmail_updates
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.gmail_messages, public.inbox_items,
  public.gmail_attachments, public.gmail_updates from anon, authenticated;
grant select on public.gmail_messages, public.inbox_items,
  public.gmail_attachments, public.gmail_updates to authenticated;
grant all on public.gmail_messages, public.inbox_items,
  public.gmail_attachments, public.gmail_updates to service_role;

revoke execute on function public.set_my_gmail_connection_status(text) from public, anon;
revoke execute on function public.resolve_my_inbox_item(uuid, text) from public, anon;
revoke execute on function public.undo_my_gmail_update(uuid) from public, anon;
grant execute on function public.set_my_gmail_connection_status(text) to authenticated, service_role;
grant execute on function public.resolve_my_inbox_item(uuid, text) to authenticated, service_role;
grant execute on function public.undo_my_gmail_update(uuid) to authenticated, service_role;

revoke execute on function public.store_gmail_oauth_credentials(uuid, text, text[], timestamptz) from public, anon, authenticated;
revoke execute on function public.read_gmail_oauth_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.delete_gmail_oauth_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.get_gmail_sync_cursor(uuid) from public, anon, authenticated;
revoke execute on function public.set_gmail_sync_cursor(uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.store_gmail_oauth_credentials(uuid, text, text[], timestamptz) to service_role;
grant execute on function public.read_gmail_oauth_credentials(uuid) to service_role;
grant execute on function public.delete_gmail_oauth_credentials(uuid) to service_role;
grant execute on function public.get_gmail_sync_cursor(uuid) to service_role;
grant execute on function public.set_gmail_sync_cursor(uuid, text, boolean) to service_role;
revoke execute on function public.apply_gmail_interview_update(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.apply_gmail_interview_update(uuid, uuid, uuid) to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

alter publication supabase_realtime add table
  public.gmail_messages, public.inbox_items,
  public.gmail_attachments, public.gmail_updates;
