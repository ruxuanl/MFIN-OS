-- M4: Google Calendar connection, event mirror, product-event links,
-- durable sync operations, explicit conflicts, and Vault-backed OAuth secrets.

alter table private.secret_references
  add column vault_secret_id uuid;

create unique index secret_references_vault_secret_idx
  on private.secret_references (vault_secret_id)
  where vault_secret_id is not null;

create table public.calendar_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.external_connections(id) on delete cascade,
  provider_calendar_id text not null check (length(provider_calendar_id) between 1 and 1024),
  summary text not null check (length(summary) between 1 and 500),
  time_zone text not null check (length(time_zone) between 1 and 120),
  access_role text not null check (access_role in ('freeBusyReader', 'reader', 'writer', 'writerWithoutPrivateAccess', 'owner')),
  is_primary boolean not null default false,
  is_product_calendar boolean not null default false,
  selected_for_conflicts boolean not null default true,
  sync_state text not null default 'pending' check (sync_state in ('pending', 'syncing', 'ready', 'stale', 'error', 'paused')),
  last_full_sync_at timestamptz,
  last_incremental_sync_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider_calendar_id),
  constraint product_calendar_owned check (not is_product_calendar or access_role = 'owner')
);

create table private.calendar_sync_cursors (
  calendar_source_id uuid primary key references public.calendar_sources(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  sync_token text not null check (length(sync_token) between 1 and 4096),
  query_fingerprint text not null check (length(query_fingerprint) between 1 and 128),
  updated_at timestamptz not null default now(),
  unique (user_id, calendar_source_id)
);

revoke all on private.calendar_sync_cursors from public, anon, authenticated;

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_source_id uuid not null references public.calendar_sources(id) on delete cascade,
  provider_event_id text not null check (length(provider_event_id) between 1 and 1024),
  etag text check (etag is null or length(etag) <= 1024),
  status text not null check (status in ('confirmed', 'tentative', 'cancelled')),
  event_type text not null default 'default' check (length(event_type) between 1 and 80),
  summary text check (summary is null or length(summary) <= 1000),
  description text check (description is null or length(description) <= 8192),
  location text check (location is null or length(location) <= 1000),
  html_link text check (html_link is null or length(html_link) <= 2048),
  event_label_id text check (event_label_id is null or length(event_label_id) <= 120),
  all_day boolean not null,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  recurring_event_id text check (recurring_event_id is null or length(recurring_event_id) <= 1024),
  transparency text check (transparency is null or transparency in ('opaque', 'transparent')),
  visibility text check (visibility is null or visibility in ('default', 'public', 'private', 'confidential')),
  creator_self boolean not null default false,
  organizer_self boolean not null default false,
  provider_created_at timestamptz,
  provider_updated_at timestamptz,
  deleted boolean not null default false,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_source_id, provider_event_id),
  constraint calendar_event_time_shape check (
    (all_day and starts_on is not null and ends_on is not null and starts_at is null and ends_at is null and starts_on < ends_on)
    or (not all_day and starts_at is not null and ends_at is not null and starts_on is null and ends_on is null and starts_at < ends_at)
    or (deleted and status = 'cancelled')
  )
);

create table public.calendar_event_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_id uuid not null references public.actions(id) on delete cascade,
  calendar_source_id uuid references public.calendar_sources(id) on delete set null,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  provider_event_id text check (provider_event_id is null or length(provider_event_id) <= 1024),
  provider_etag text check (provider_etag is null or length(provider_etag) <= 1024),
  category text not null check (category in ('academic', 'internship', 'graduate', 'personal')),
  all_day boolean not null,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  scheduled_start_date date,
  scheduled_end_date date,
  last_synced_action_version bigint check (last_synced_action_version is null or last_synced_action_version > 0),
  last_synced_provider_updated_at timestamptz,
  sync_status text not null default 'pending' check (sync_status in ('pending', 'syncing', 'synced', 'conflict', 'failed', 'detached')),
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, action_id),
  unique (calendar_source_id, provider_event_id),
  constraint calendar_link_time_shape check (
    (all_day and scheduled_start_date is not null and scheduled_end_date is not null and scheduled_start_at is null and scheduled_end_at is null and scheduled_start_date < scheduled_end_date)
    or (not all_day and scheduled_start_at is not null and scheduled_end_at is not null and scheduled_start_date is null and scheduled_end_date is null and scheduled_start_at < scheduled_end_at)
  )
);

create table public.calendar_sync_operations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_link_id uuid not null references public.calendar_event_links(id) on delete cascade,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  operation_type text not null check (operation_type in ('create', 'update')),
  capability_key text not null references public.capability_definitions(capability_key) on delete restrict,
  target_action_version bigint not null check (target_action_version > 0),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'cancelled', 'conflict')),
  blocked_reason text,
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  max_attempts smallint not null default 3 check (max_attempts between 1 and 5),
  last_error_code text,
  next_attempt_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create unique index calendar_sync_operations_one_active_idx
  on public.calendar_sync_operations (event_link_id)
  where status in ('pending', 'processing');

create table public.calendar_sync_conflicts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_link_id uuid not null references public.calendar_event_links(id) on delete cascade,
  conflict_type text not null check (conflict_type in ('remote_deleted', 'concurrent_change', 'write_protected')),
  product_snapshot jsonb not null default '{}',
  provider_snapshot jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'resolved', 'discarded')),
  resolution text check (resolution is null or resolution in ('cancel_schedule', 'resync', 'use_product', 'accept_calendar', 'keep_read_only')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint calendar_conflict_payload_objects check (
    jsonb_typeof(product_snapshot) = 'object' and jsonb_typeof(provider_snapshot) = 'object'
  ),
  constraint calendar_conflict_payload_size check (
    pg_column_size(product_snapshot) + pg_column_size(provider_snapshot) <= 32768
  ),
  constraint calendar_conflict_resolution_shape check (
    (status = 'pending' and resolution is null and resolved_at is null)
    or (status in ('resolved', 'discarded') and resolution is not null and resolved_at is not null)
  )
);

create unique index calendar_sync_conflicts_one_pending_idx
  on public.calendar_sync_conflicts (event_link_id)
  where status = 'pending';

create index calendar_sources_sync_idx
  on public.calendar_sources (user_id, sync_state, is_product_calendar desc);
create index calendar_events_range_idx
  on public.calendar_events (user_id, deleted, starts_at, starts_on);
create index calendar_events_provider_updated_idx
  on public.calendar_events (calendar_source_id, provider_updated_at desc);
create index calendar_event_links_sync_idx
  on public.calendar_event_links (user_id, sync_status, updated_at);
create index calendar_sync_operations_pending_idx
  on public.calendar_sync_operations (user_id, status, next_attempt_at, created_at);
create index calendar_sync_conflicts_status_idx
  on public.calendar_sync_conflicts (user_id, status, created_at desc);

create trigger calendar_sources_set_updated_at before update on public.calendar_sources
for each row execute function private.set_updated_at();
create trigger calendar_events_set_updated_at before update on public.calendar_events
for each row execute function private.set_updated_at();
create trigger calendar_event_links_set_updated_at before update on public.calendar_event_links
for each row execute function private.set_updated_at();
create trigger calendar_sync_operations_set_updated_at before update on public.calendar_sync_operations
for each row execute function private.set_updated_at();

create or replace function private.m4_writes_allowed(target_user_id uuid)
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

create or replace function private.calendar_link_identity_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (
    old.user_id is distinct from new.user_id
    or old.action_id is distinct from new.action_id
    or old.category is distinct from new.category
  ) then
    raise exception 'calendar_link_identity_immutable' using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.actions a
    where a.id = new.action_id and a.user_id = new.user_id
  ) then
    raise exception 'calendar_link_action_mismatch' using errcode = '23503';
  end if;

  if new.calendar_source_id is not null and not exists (
    select 1 from public.calendar_sources s
    where s.id = new.calendar_source_id and s.user_id = new.user_id and s.is_product_calendar
  ) then
    raise exception 'calendar_link_requires_product_calendar' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger calendar_event_links_identity_guard
before insert or update on public.calendar_event_links
for each row execute function private.calendar_link_identity_guard();

create or replace function private.reject_calendar_sensitive_payload()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.contains_sensitive_key(new.product_snapshot)
     or private.contains_sensitive_key(new.provider_snapshot) then
    raise exception 'sensitive_payload_key' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger calendar_sync_conflicts_sensitive_payload
before insert or update on public.calendar_sync_conflicts
for each row execute function private.reject_calendar_sensitive_payload();

create or replace function public.queue_action_calendar_sync(
  target_action_id uuid,
  target_all_day boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  action_record public.actions%rowtype;
  source_record public.calendar_sources%rowtype;
  link_record public.calendar_event_links%rowtype;
  operation_id uuid;
  operation_type text;
  capability_key text;
  decision record;
  start_time timestamptz;
  end_time timestamptz;
  start_date date;
  end_date date;
begin
  select * into action_record
  from public.actions
  where id = target_action_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'action_not_found' using errcode = 'P0002';
  end if;
  if not private.m4_writes_allowed(auth.uid()) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  if target_all_day then
    if action_record.due_at is null then
      raise exception 'all_day_requires_due_date' using errcode = '22023';
    end if;
    start_date := (action_record.due_at at time zone 'Asia/Hong_Kong')::date;
    end_date := start_date + 1;
  else
    start_time := coalesce(action_record.suggested_start_at, action_record.due_at);
    if start_time is null then
      raise exception 'timed_event_requires_start' using errcode = '22023';
    end if;
    end_time := start_time + make_interval(mins => coalesce(action_record.estimated_minutes, 30));
  end if;

  select * into source_record
  from public.calendar_sources
  where user_id = auth.uid() and is_product_calendar
  order by created_at desc
  limit 1;

  select * into link_record
  from public.calendar_event_links
  where user_id = auth.uid() and action_id = target_action_id
  for update;

  operation_type := case when found and link_record.provider_event_id is not null then 'update' else 'create' end;
  capability_key := case when operation_type = 'create' then 'calendar.write_confirmed_plan' else 'calendar.update_product_event' end;
  select * into decision from private.evaluate_permission(auth.uid(), capability_key, null);

  insert into public.calendar_event_links (
    user_id, action_id, calendar_source_id, provider_event_id, provider_etag,
    category, all_day, scheduled_start_at, scheduled_end_at,
    scheduled_start_date, scheduled_end_date, sync_status, last_error_code
  ) values (
    auth.uid(), action_record.id, source_record.id, link_record.provider_event_id, link_record.provider_etag,
    action_record.track, target_all_day, start_time, end_time,
    start_date, end_date, 'pending', null
  )
  on conflict (user_id, action_id) do update set
    calendar_source_id = coalesce(excluded.calendar_source_id, public.calendar_event_links.calendar_source_id),
    all_day = excluded.all_day,
    scheduled_start_at = excluded.scheduled_start_at,
    scheduled_end_at = excluded.scheduled_end_at,
    scheduled_start_date = excluded.scheduled_start_date,
    scheduled_end_date = excluded.scheduled_end_date,
    sync_status = 'pending',
    last_error_code = null
  returning * into link_record;

  insert into public.calendar_sync_operations (
    user_id, event_link_id, idempotency_key, operation_type,
    capability_key, target_action_version, blocked_reason
  ) values (
    auth.uid(), link_record.id,
    action_record.id::text || ':' || action_record.version::text || ':' || operation_type,
    operation_type, capability_key, action_record.version,
    case when decision.allowed then null else decision.reason end
  )
  on conflict (user_id, idempotency_key) do update set
    blocked_reason = excluded.blocked_reason,
    last_error_code = null,
    next_attempt_at = null,
    status = case
      when public.calendar_sync_operations.status in ('failed', 'cancelled', 'conflict') then 'pending'
      else public.calendar_sync_operations.status
    end
  returning id into operation_id;

  update public.actions
  set status = case when status in ('unscheduled', 'waiting') then 'scheduled' else status end,
      version = version + 1
  where id = action_record.id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    auth.uid(), 'action', action_record.id, 'calendar_sync_queued', 'user',
    case when decision.allowed then 'Calendar 同步已排队' else 'Calendar 写入当前关闭，事项保留为待同步' end,
    jsonb_build_object('all_day', target_all_day, 'operation', operation_type, 'permission', decision.reason)
  );

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'calendar.sync_queued', 'action', action_record.id::text,
    jsonb_build_object('event_link_id', link_record.id, 'operation', operation_type, 'sync_status', 'pending'),
    jsonb_build_object('allowed', decision.allowed, 'reason', decision.reason), 'succeeded'
  );

  return operation_id;
end;
$$;

create or replace function public.set_my_calendar_connection_status(target_status text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  connection_record public.external_connections%rowtype;
begin
  if target_status not in ('connected', 'paused') then
    raise exception 'invalid_calendar_connection_status' using errcode = '22023';
  end if;
  if target_status = 'connected' and exists (
    select 1 from public.privacy_locks where user_id = auth.uid() and is_locked
  ) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  select * into connection_record
  from public.external_connections
  where user_id = auth.uid() and provider = 'calendar'
  for update;
  if not found or connection_record.secret_reference_id is null then
    raise exception 'calendar_not_authorized' using errcode = '42501';
  end if;

  update public.external_connections
  set status = target_status,
      last_error_code = null,
      last_error_at = null
  where id = connection_record.id;

  update public.calendar_sources
  set sync_state = case when target_status = 'paused' then 'paused' else 'stale' end
  where connection_id = connection_record.id;

  update public.calendar_sync_operations
  set blocked_reason = case when target_status = 'paused' then 'connection_paused' else blocked_reason end
  where user_id = auth.uid() and status = 'pending';

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'calendar.connection_' || target_status,
    'external_connection', connection_record.id::text,
    jsonb_build_object('status', target_status),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );
  return target_status;
end;
$$;

create or replace function public.resolve_calendar_sync_conflict(
  target_conflict_id uuid,
  target_resolution text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  conflict_record public.calendar_sync_conflicts%rowtype;
  link_record public.calendar_event_links%rowtype;
  event_record public.calendar_events%rowtype;
  action_record public.actions%rowtype;
  operation_id uuid;
begin
  if target_resolution not in ('cancel_schedule', 'resync', 'use_product', 'accept_calendar', 'keep_read_only') then
    raise exception 'invalid_calendar_conflict_resolution' using errcode = '22023';
  end if;
  if not private.m4_writes_allowed(auth.uid()) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;

  select * into conflict_record
  from public.calendar_sync_conflicts
  where id = target_conflict_id and user_id = auth.uid() and status = 'pending'
  for update;
  if not found then
    raise exception 'calendar_conflict_not_found' using errcode = 'P0002';
  end if;

  select * into link_record from public.calendar_event_links
  where id = conflict_record.event_link_id and user_id = auth.uid() for update;
  select * into action_record from public.actions
  where id = link_record.action_id and user_id = auth.uid() for update;
  if link_record.calendar_event_id is not null then
    select * into event_record from public.calendar_events where id = link_record.calendar_event_id;
  end if;

  if target_resolution = 'cancel_schedule' then
    update public.calendar_event_links
    set sync_status = 'detached', provider_event_id = null, provider_etag = null,
        calendar_event_id = null, last_error_code = null
    where id = link_record.id;
    update public.actions
    set status = case when status = 'scheduled' then 'unscheduled' else status end,
        suggested_start_at = case when status = 'scheduled' then null else suggested_start_at end,
        version = version + 1
    where id = action_record.id;
  elsif target_resolution in ('resync', 'use_product') then
    update public.calendar_event_links
    set sync_status = 'pending',
        provider_event_id = case when target_resolution = 'resync' then null else provider_event_id end,
        provider_etag = case when target_resolution = 'resync' then null else event_record.etag end,
        calendar_event_id = case when target_resolution = 'resync' then null else calendar_event_id end,
        last_synced_provider_updated_at = case
          when target_resolution = 'use_product' then event_record.provider_updated_at
          else last_synced_provider_updated_at
        end,
        last_error_code = null
    where id = link_record.id;
    insert into public.calendar_sync_operations (
      user_id, event_link_id, idempotency_key, operation_type,
      capability_key, target_action_version
    ) values (
      auth.uid(), link_record.id,
      link_record.id::text || ':resolution:' || target_conflict_id::text,
      case when target_resolution = 'resync' then 'create' else 'update' end,
      case when target_resolution = 'resync' then 'calendar.write_confirmed_plan' else 'calendar.update_product_event' end,
      action_record.version
    ) returning id into operation_id;
  elsif target_resolution = 'accept_calendar' then
    if event_record.id is null or event_record.deleted then
      raise exception 'calendar_event_unavailable' using errcode = 'P0002';
    end if;
    update public.calendar_event_links
    set all_day = event_record.all_day,
        scheduled_start_at = event_record.starts_at,
        scheduled_end_at = event_record.ends_at,
        scheduled_start_date = event_record.starts_on,
        scheduled_end_date = event_record.ends_on,
        provider_etag = event_record.etag,
        last_synced_provider_updated_at = event_record.provider_updated_at,
        last_synced_action_version = action_record.version + 1,
        sync_status = 'synced', last_error_code = null
    where id = link_record.id;
    update public.actions
    set suggested_start_at = case
          when event_record.all_day then null else event_record.starts_at
        end,
        due_at = case
          when event_record.all_day then event_record.starts_on::timestamp at time zone 'Asia/Hong_Kong'
          else due_at
        end,
        status = case when status in ('unscheduled', 'waiting') then 'scheduled' else status end,
        version = version + 1
    where id = action_record.id;
  else
    update public.calendar_event_links
    set sync_status = 'detached', last_error_code = null
    where id = link_record.id;
  end if;

  update public.calendar_sync_conflicts
  set status = case when target_resolution = 'keep_read_only' then 'discarded' else 'resolved' end,
      resolution = target_resolution,
      resolved_at = now()
  where id = conflict_record.id;

  insert into public.timeline_entries (
    user_id, entity_type, entity_id, event_type, actor_type, summary, changes
  ) values (
    auth.uid(), 'action', action_record.id, 'calendar_conflict_resolved', 'user',
    'Calendar 同步冲突已由用户明确处理',
    jsonb_build_object('conflict_type', conflict_record.conflict_type, 'resolution', target_resolution)
  );

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    auth.uid(), 'user', 'calendar.conflict_resolved', 'calendar_sync_conflict', conflict_record.id::text,
    jsonb_build_object('resolution', target_resolution, 'event_link_id', link_record.id),
    jsonb_build_object('source', 'authenticated_rpc'), 'succeeded'
  );
  return operation_id;
end;
$$;

create or replace function public.store_calendar_oauth_credentials(
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
begin
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'user_not_found' using errcode = 'P0002';
  end if;
  if length(target_secret_payload) > 16384 then
    raise exception 'calendar_secret_too_large' using errcode = '22023';
  end if;

  select * into secret_record from private.secret_references
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials'
  for update;

  if found and secret_record.vault_secret_id is not null then
    perform vault.update_secret(
      secret_record.vault_secret_id, target_secret_payload,
      'calendar-oauth-' || target_user_id::text,
      'Google Calendar OAuth credentials for isolated personal system', null
    );
    vault_id := secret_record.vault_secret_id;
    update private.secret_references
    set disabled_at = null, rotated_at = now()
    where id = secret_record.id;
  else
    vault_id := vault.create_secret(
      target_secret_payload,
      'calendar-oauth-' || target_user_id::text,
      'Google Calendar OAuth credentials for isolated personal system'
    );
    insert into private.secret_references (
      user_id, provider, secret_name, vault_secret_id, rotated_at, disabled_at
    ) values (
      target_user_id, 'calendar', 'oauth_credentials', vault_id, now(), null
    )
    on conflict (user_id, provider, secret_name) do update set
      vault_secret_id = excluded.vault_secret_id,
      rotated_at = now(), disabled_at = null
    returning * into secret_record;
  end if;

  select id into secret_record.id from private.secret_references
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials';

  insert into public.external_connections (
    user_id, provider, status, granted_scopes, secret_reference_id,
    last_success_at, last_error_code, last_error_at
  ) values (
    target_user_id, 'calendar', 'connected', target_scopes, secret_record.id,
    now(), null, null
  )
  on conflict (user_id, provider) do update set
    status = 'connected', granted_scopes = excluded.granted_scopes,
    secret_reference_id = excluded.secret_reference_id,
    last_success_at = now(), last_error_code = null, last_error_at = null
  returning id into connection_id;

  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'calendar.connected', 'external_connection', connection_id::text,
    jsonb_build_object('status', 'connected', 'scopes', target_scopes, 'expires_at', target_expires_at),
    jsonb_build_object('credential_storage', 'supabase_vault'), 'succeeded'
  );
  return connection_id;
end;
$$;

create or replace function public.read_calendar_oauth_credentials(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ds.decrypted_secret
  from private.secret_references sr
  join vault.decrypted_secrets ds on ds.id = sr.vault_secret_id
  where sr.user_id = target_user_id
    and sr.provider = 'calendar'
    and sr.secret_name = 'oauth_credentials'
    and sr.disabled_at is null;
$$;

create or replace function public.delete_calendar_oauth_credentials(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  vault_id uuid;
begin
  select vault_secret_id into vault_id
  from private.secret_references
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials'
  for update;

  if vault_id is not null then
    delete from vault.secrets where id = vault_id;
  end if;
  update private.secret_references
  set vault_secret_id = null, disabled_at = now()
  where user_id = target_user_id and provider = 'calendar' and secret_name = 'oauth_credentials';
  update public.external_connections
  set status = 'disconnected', secret_reference_id = null,
      last_error_code = null, last_error_at = null
  where user_id = target_user_id and provider = 'calendar';
  update public.calendar_sources
  set sync_state = 'paused'
  where user_id = target_user_id;
  update public.calendar_sync_operations
  set status = 'cancelled', finished_at = now(), blocked_reason = 'connection_disconnected'
  where user_id = target_user_id and status in ('pending', 'processing');
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id,
    after_state, permission_decision, outcome
  ) values (
    target_user_id, 'system', 'calendar.disconnected', 'external_connection', target_user_id::text,
    jsonb_build_object('status', 'disconnected'),
    jsonb_build_object('credential_deleted', vault_id is not null), 'succeeded'
  );
  return vault_id is not null;
end;
$$;

create or replace function public.get_calendar_sync_cursor(target_source_id uuid)
returns table (sync_token text, query_fingerprint text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.sync_token, c.query_fingerprint
  from private.calendar_sync_cursors c
  where c.calendar_source_id = target_source_id;
$$;

create or replace function public.set_calendar_sync_cursor(
  target_user_id uuid,
  target_source_id uuid,
  target_sync_token text,
  target_query_fingerprint text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.calendar_sources
    where id = target_source_id and user_id = target_user_id
  ) then
    raise exception 'calendar_source_not_found' using errcode = 'P0002';
  end if;
  insert into private.calendar_sync_cursors (
    calendar_source_id, user_id, sync_token, query_fingerprint
  ) values (
    target_source_id, target_user_id, target_sync_token, target_query_fingerprint
  )
  on conflict (calendar_source_id) do update set
    sync_token = excluded.sync_token,
    query_fingerprint = excluded.query_fingerprint,
    updated_at = now();
end;
$$;

create or replace function public.clear_calendar_sync_cursor(target_source_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from private.calendar_sync_cursors where calendar_source_id = target_source_id;
$$;

alter table public.calendar_sources enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_event_links enable row level security;
alter table public.calendar_sync_operations enable row level security;
alter table public.calendar_sync_conflicts enable row level security;
alter table private.calendar_sync_cursors enable row level security;

create policy calendar_sources_read_own on public.calendar_sources
for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_events_read_own on public.calendar_events
for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_event_links_read_own on public.calendar_event_links
for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_sync_operations_read_own on public.calendar_sync_operations
for select to authenticated using ((select auth.uid()) = user_id);
create policy calendar_sync_conflicts_read_own on public.calendar_sync_conflicts
for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.calendar_sources, public.calendar_events,
  public.calendar_event_links, public.calendar_sync_operations,
  public.calendar_sync_conflicts from anon, authenticated;
grant select on public.calendar_sources, public.calendar_events,
  public.calendar_event_links, public.calendar_sync_operations,
  public.calendar_sync_conflicts to authenticated;
grant all on public.calendar_sources, public.calendar_events,
  public.calendar_event_links, public.calendar_sync_operations,
  public.calendar_sync_conflicts to service_role;

revoke execute on function public.queue_action_calendar_sync(uuid, boolean) from public, anon;
revoke execute on function public.set_my_calendar_connection_status(text) from public, anon;
revoke execute on function public.resolve_calendar_sync_conflict(uuid, text) from public, anon;
grant execute on function public.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function public.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function public.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;

revoke execute on function public.store_calendar_oauth_credentials(uuid, text, text[], timestamptz) from public, anon, authenticated;
revoke execute on function public.read_calendar_oauth_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.delete_calendar_oauth_credentials(uuid) from public, anon, authenticated;
revoke execute on function public.get_calendar_sync_cursor(uuid) from public, anon, authenticated;
revoke execute on function public.set_calendar_sync_cursor(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.clear_calendar_sync_cursor(uuid) from public, anon, authenticated;
grant execute on function public.store_calendar_oauth_credentials(uuid, text, text[], timestamptz) to service_role;
grant execute on function public.read_calendar_oauth_credentials(uuid) to service_role;
grant execute on function public.delete_calendar_oauth_credentials(uuid) to service_role;
grant execute on function public.get_calendar_sync_cursor(uuid) to service_role;
grant execute on function public.set_calendar_sync_cursor(uuid, uuid, text, text) to service_role;
grant execute on function public.clear_calendar_sync_cursor(uuid) to service_role;

revoke execute on all functions in schema private from public, anon, authenticated;

alter publication supabase_realtime add table
  public.calendar_sources, public.calendar_events,
  public.calendar_event_links, public.calendar_sync_operations,
  public.calendar_sync_conflicts;
