-- Issue #12 (D09): unified search v1 — keyword + structured filters, no vectors (D28).
-- search_documents is a rebuildable projection maintained by triggers. Matching uses
-- case-insensitive substring search (works for two-character Chinese words); a pg_trgm GIN
-- index narrows candidates for the first term; ranking weights title over body. Full e-mail bodies never exist
-- in this product, and only Gmail's minimal projection (subject, sender, summary) is indexed.

create extension if not exists pg_trgm with schema extensions;

create table public.search_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  object_type text not null check (object_type in ('opportunity', 'candidate', 'gmail_message')),
  object_id uuid not null,
  track text check (track is null or track in ('internship', 'graduate')),
  title text not null check (length(title) between 1 and 600),
  body text not null default '' check (length(body) <= 8000),
  company text check (company is null or length(company) <= 240),
  location text check (location is null or length(location) <= 240),
  stage text check (stage is null or length(stage) <= 40),
  deadline date,
  source_url text check (source_url is null or length(source_url) <= 2048),
  source_kind text not null check (source_kind in ('user', 'jd_paste', 'public_source', 'gmail')),
  source_at timestamptz,
  search_text text generated always as (lower(title || ' ' || body)) stored,
  indexed_at timestamptz not null default now(),
  unique (object_type, object_id)
);

create index search_documents_user_type_idx on public.search_documents (user_id, object_type, track);
create index search_documents_trgm_idx on public.search_documents using gin (search_text extensions.gin_trgm_ops);

alter table public.search_documents enable row level security;
create policy search_documents_select_own on public.search_documents
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.search_documents from public, anon, authenticated;
grant select on table public.search_documents to authenticated;
grant select, insert, update, delete on table public.search_documents to service_role;

-- Projection functions (SECURITY DEFINER: they only copy the triggering owner's row).
create function private.search_upsert(
  target_user_id uuid, target_type text, target_id uuid, target_track text, target_title text, target_body text,
  target_company text, target_location text, target_stage text, target_deadline date, target_source_url text,
  target_source_kind text, target_source_at timestamptz
) returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.search_documents (user_id, object_type, object_id, track, title, body, company, location,
    stage, deadline, source_url, source_kind, source_at, indexed_at)
  values (target_user_id, target_type, target_id, target_track, left(coalesce(nullif(btrim(target_title), ''), '（无标题）'), 600),
    left(coalesce(target_body, ''), 8000), left(target_company, 240), left(target_location, 240), target_stage,
    target_deadline, left(target_source_url, 2048), target_source_kind, target_source_at, now())
  on conflict (object_type, object_id) do update set
    user_id = excluded.user_id, track = excluded.track, title = excluded.title, body = excluded.body,
    company = excluded.company, location = excluded.location, stage = excluded.stage,
    deadline = excluded.deadline, source_url = excluded.source_url, source_kind = excluded.source_kind,
    source_at = excluded.source_at, indexed_at = now()
$$;

-- One projection function per source table; triggers and the rebuild both use them.
create function private.search_project_opportunity(o public.opportunities)
returns void
language sql
security definer
set search_path = ''
as $$
  select private.search_upsert(o.user_id, 'opportunity', o.id, o.track,
    o.company || ' · ' || o.role_title,
    concat_ws(E'\n', o.department, o.location, o.substage, o.responsibilities, o.requirements,
      o.application_method, left(o.raw_jd, 6000)),
    o.company, o.location, o.main_stage, o.deadline, o.source_url,
    case when o.raw_jd is not null then 'jd_paste' else 'user' end, coalesce(o.posted_on::timestamptz, o.created_at))
$$;

create function private.search_project_candidate(c public.opportunity_candidates)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Promoted candidates live on as opportunities; dismissed ones leave search.
  if c.decision_status in ('promoted', 'dismissed') then
    delete from public.search_documents where object_type = 'candidate' and object_id = c.id;
    return;
  end if;
  perform private.search_upsert(c.user_id, 'candidate', c.id, c.track,
    c.company || ' · ' || c.role_title,
    concat_ws(E'\n', c.department, c.location, c.source_summary),
    c.company, c.location, c.decision_status, c.deadline, c.source_url,
    case when c.jd_fingerprint is not null then 'jd_paste' when c.source_url is not null then 'public_source' else 'user' end,
    coalesce(c.posted_on::timestamptz, c.discovered_at));
end;
$$;

create function private.search_project_gmail_message(m public.gmail_messages)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if m.classification = 'irrelevant' then
    delete from public.search_documents where object_type = 'gmail_message' and object_id = m.id;
    return;
  end if;
  perform private.search_upsert(m.user_id, 'gmail_message', m.id, null,
    coalesce(nullif(btrim(m.subject), ''), '（无主题邮件）'),
    concat_ws(E'\n', m.sender_summary, m.summary, m.action_title),
    null, null, m.classification, (m.action_due_at at time zone 'Asia/Hong_Kong')::date, m.gmail_link,
    'gmail', m.received_at);
end;
$$;

create function private.search_index_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_type text := case tg_table_name
    when 'opportunities' then 'opportunity'
    when 'opportunity_candidates' then 'candidate'
    when 'gmail_messages' then 'gmail_message' end;
begin
  if tg_op = 'DELETE' then
    delete from public.search_documents where object_type = target_type and object_id = old.id;
    return old;
  end if;
  if tg_table_name = 'opportunities' then perform private.search_project_opportunity(new);
  elsif tg_table_name = 'opportunity_candidates' then perform private.search_project_candidate(new);
  else perform private.search_project_gmail_message(new);
  end if;
  return new;
end;
$$;

create trigger opportunities_search_index after insert or update or delete on public.opportunities
  for each row execute function private.search_index_trigger();
create trigger opportunity_candidates_search_index after insert or update or delete on public.opportunity_candidates
  for each row execute function private.search_index_trigger();
create trigger gmail_messages_search_index after insert or update or delete on public.gmail_messages
  for each row execute function private.search_index_trigger();

-- Full rebuild for the caller (idempotent); the migration backfills every user once.
create function private.rebuild_search_documents(target_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  touched integer;
begin
  -- Re-project from the source tables without touching them (no updated_at changes).
  delete from public.search_documents where user_id = target_user_id;
  perform private.search_project_opportunity(o) from public.opportunities o where o.user_id = target_user_id;
  perform private.search_project_candidate(c) from public.opportunity_candidates c where c.user_id = target_user_id;
  perform private.search_project_gmail_message(m) from public.gmail_messages m where m.user_id = target_user_id;
  select count(*) into touched from public.search_documents where user_id = target_user_id;
  return touched;
end;
$$;

-- Owner-only entry point: rebuilds the caller's own projection, never another user's.
create function private.rebuild_my_search_documents_impl()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  return private.rebuild_search_documents(actor_user_id);
end;
$$;

create function public.rebuild_my_search_documents()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.rebuild_my_search_documents_impl();
end;
$$;

-- Search. Every whitespace-separated term must match (AND); filters are optional.
create function public.search_my_workspace(
  target_query text,
  target_types text[] default null,
  target_track text default null,
  target_stage text default null,
  target_company text default null,
  target_location text default null,
  target_deadline_from date default null,
  target_deadline_to date default null,
  target_limit integer default 50
)
returns table(
  object_type text, object_id uuid, track text, title text, snippet text, company text, location text,
  stage text, deadline date, source_url text, source_kind text, source_at timestamptz, indexed_at timestamptz,
  score real
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  terms text[];
  normalized text := lower(btrim(coalesce(target_query, '')));
  first_pattern text;
begin
  if auth.uid() is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if exists (select 1 from public.privacy_locks l where l.user_id = auth.uid() and l.is_locked) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if length(normalized) > 200 or coalesce(target_limit, 50) not between 1 and 100 then
    raise exception 'invalid_search' using errcode = '22023';
  end if;
  terms := array(select t from unnest(regexp_split_to_array(normalized, '\s+')) as t where t <> '' limit 8);
  first_pattern := case when cardinality(terms) = 0 then null
    else '%' || replace(replace(replace(terms[1], '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  return query
  select d.object_type, d.object_id, d.track, d.title,
    case
      when cardinality(terms) = 0 or position(terms[1] in lower(d.body)) = 0 then left(d.body, 160)
      else substr(d.body, greatest(1, position(terms[1] in lower(d.body)) - 40), 160)
    end,
    d.company, d.location, d.stage, d.deadline, d.source_url, d.source_kind, d.source_at, d.indexed_at,
    (
      (select count(*) from unnest(terms) t where position(t in lower(d.title)) > 0) * 3.0
      + (select count(*) from unnest(terms) t where position(t in lower(d.body)) > 0)
      + case when cardinality(terms) > 0 and lower(d.title) like first_pattern then 0.5 else 0 end
    )::real as score
  from public.search_documents d
  where d.user_id = auth.uid()
    and (target_types is null or d.object_type = any(target_types))
    and (target_track is null or d.track = target_track)
    and (target_stage is null or d.stage = target_stage)
    and (target_company is null or d.company ilike '%' || target_company || '%')
    and (target_location is null or d.location ilike '%' || target_location || '%')
    and (target_deadline_from is null or d.deadline >= target_deadline_from)
    and (target_deadline_to is null or d.deadline <= target_deadline_to)
    -- The LIKE on the first term lets the trigram index narrow candidates; the
    -- NOT EXISTS then requires every term.
    and (cardinality(terms) = 0 or d.search_text like first_pattern escape '\')
    and not exists (select 1 from unnest(terms) t where position(t in d.search_text) = 0)
  order by score desc, d.source_at desc nulls last
  limit coalesce(target_limit, 50);
end;
$$;

revoke all on function private.search_upsert(uuid, text, uuid, text, text, text, text, text, text, date, text, text, timestamptz) from public, anon, authenticated;
revoke all on function private.search_project_opportunity(public.opportunities) from public, anon, authenticated;
revoke all on function private.search_project_candidate(public.opportunity_candidates) from public, anon, authenticated;
revoke all on function private.search_project_gmail_message(public.gmail_messages) from public, anon, authenticated;
revoke all on function private.search_index_trigger() from public, anon, authenticated;
revoke all on function private.rebuild_search_documents(uuid) from public, anon, authenticated;
grant execute on function private.rebuild_search_documents(uuid) to service_role;
revoke all on function private.rebuild_my_search_documents_impl() from public, anon;
grant execute on function private.rebuild_my_search_documents_impl() to authenticated, service_role;
revoke all on function public.rebuild_my_search_documents() from public, anon;
grant execute on function public.rebuild_my_search_documents() to authenticated, service_role;
revoke all on function public.search_my_workspace(text, text[], text, text, text, text, date, date, integer) from public, anon;
grant execute on function public.search_my_workspace(text, text[], text, text, text, text, date, date, integer) to authenticated, service_role;

-- Backfill existing rows for every user.
do $$
declare
  owner_id uuid;
begin
  for owner_id in
    select user_id from public.opportunities
    union select user_id from public.opportunity_candidates
    union select user_id from public.gmail_messages
  loop
    perform private.rebuild_search_documents(owner_id);
  end loop;
end;
$$;

notify pgrst, 'reload schema';
