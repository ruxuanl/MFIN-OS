-- Issue #17: suggest links between job e-mails and long-term opportunities.
-- Rules only (mail_link_rules_v1, not AI). A suggestion is created only when exactly one active
-- opportunity matches, trying in order: sender domain (from the job's source URL), company name,
-- company + role title, role title alone. Every suggestion waits for the user; confirming,
-- rejecting or unlinking never changes an opportunity's stage (D23 stays as narrow as before).

create table public.opportunity_communications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  gmail_message_id uuid not null references public.gmail_messages(id) on delete cascade,
  status text not null default 'suggested' check (status in ('suggested', 'linked', 'rejected', 'unlinked')),
  match_rule text not null check (match_rule in ('sender_domain', 'company_name', 'company_and_role', 'role_title')),
  match_evidence text not null check (length(match_evidence) between 1 and 300),
  rule_version text not null default 'mail_link_rules_v1' check (rule_version = 'mail_link_rules_v1'),
  suggested_at timestamptz not null default now(),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (gmail_message_id, opportunity_id),
  constraint opportunity_communication_decision_shape check ((status = 'suggested') = (decided_at is null))
);

create unique index opportunity_communications_one_link_idx
  on public.opportunity_communications (gmail_message_id) where status = 'linked';
create index opportunity_communications_user_status_idx
  on public.opportunity_communications (user_id, status, suggested_at desc);
create index opportunity_communications_opportunity_idx
  on public.opportunity_communications (opportunity_id, status);

create trigger opportunity_communications_set_updated_at before update on public.opportunity_communications
  for each row execute function private.set_updated_at();

alter table public.opportunity_communications enable row level security;
create policy opportunity_communications_select_own on public.opportunity_communications
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.opportunity_communications from public, anon, authenticated;
grant select on table public.opportunity_communications to authenticated;
grant select, insert, update, delete on table public.opportunity_communications to service_role;

-- Registrable-ish domain of a job's source URL; null for shared hiring platforms whose domain
-- says nothing about the employer.
create function private.mail_link_domain(source_url text)
returns text
language sql
immutable
set search_path = ''
as $$
  with host as (
    select regexp_replace(lower(substring(source_url from '^https?://([^/:?#]+)')), '^(www|careers|career|jobs|job|campus|hr|recruit|recruiting)\.', '') as value
  ), base as (
    select case
      when value ~ '\.(com|co|org|net|gov|edu|ac)\.[a-z]{2}$' then substring(value from '([a-z0-9-]+\.[a-z]+\.[a-z]{2})$')
      else substring(value from '([a-z0-9-]+\.[a-z]{2,})$')
    end as value
    from host
  )
  select case
    when value is null or length(value) < 4 then null
    when value in ('myworkdayjobs.com', 'workday.com', 'greenhouse.io', 'lever.co', 'linkedin.com', 'indeed.com',
      'smartrecruiters.com', 'oraclecloud.com', 'successfactors.com', 'taleo.net', 'mokahr.com', 'zhiye.com',
      'nowcoder.com', 'liepin.com', 'zhipin.com', 'gmail.com', 'outlook.com', 'qq.com', '163.com') then null
    else value
  end
  from base;
$$;

-- Company name without parenthetical notes or legal suffixes, lower-cased; null if too short.
create function private.mail_link_company_key(company text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(value) >= 2 then value end
  from (
    select btrim(regexp_replace(
      btrim(regexp_replace(lower(coalesce(company, '')), '（[^）]*）|\([^)]*\)', '', 'g')),
      '\s*(股份有限公司|有限责任公司|有限公司|集团|limited|ltd\.?|inc\.?|llc|plc|group)$', '')) as value
  ) normalized;
$$;

create function private.suggest_communication_links(m public.gmail_messages)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  haystack text := lower(concat_ws(' ', m.subject, m.sender_summary, m.summary, m.action_title));
  sender text := lower(coalesce(m.sender_summary, ''));
  hits uuid[];
  chosen uuid;
  rule text;
  evidence text;
  link_id uuid;
begin
  if m.classification <> 'job' then return null; end if;
  if exists (select 1 from public.opportunity_communications c where c.gmail_message_id = m.id and c.status in ('suggested', 'linked')) then
    return null;
  end if;
  -- Interview e-mails already linked by the narrow D23 auto-update need no suggestion.
  if exists (
    select 1 from public.inbox_items i join public.gmail_updates u on u.inbox_item_id = i.id
    where i.gmail_message_id = m.id and u.status = 'applied'
  ) then
    return null;
  end if;

  -- No temp tables here: a caller-created temp table could shadow it inside SECURITY DEFINER.
  select array_agg(o.id) into hits from public.opportunities o
  where o.user_id = m.user_id and o.record_state = 'active'
    and private.mail_link_domain(o.source_url) is not null
    and position(private.mail_link_domain(o.source_url) in sender) > 0;
  if cardinality(hits) = 1 then
    chosen := hits[1]; rule := 'sender_domain';
    select '发件人域名 ' || private.mail_link_domain(o.source_url) into evidence from public.opportunities o where o.id = chosen;
  else
    select array_agg(o.id) into hits from public.opportunities o
    where o.user_id = m.user_id and o.record_state = 'active'
      and private.mail_link_company_key(o.company) is not null
      and position(private.mail_link_company_key(o.company) in haystack) > 0;
    if cardinality(hits) = 1 then
      chosen := hits[1]; rule := 'company_name';
      select '公司名“' || o.company || '”' into evidence from public.opportunities o where o.id = chosen;
    elsif cardinality(hits) > 1 then
      select array_agg(o.id) into hits from public.opportunities o
      where o.id = any(hits) and length(o.role_title) >= 4 and position(lower(o.role_title) in haystack) > 0;
      if cardinality(hits) = 1 then
        chosen := hits[1]; rule := 'company_and_role';
        select '公司名“' || o.company || '”与岗位名“' || o.role_title || '”' into evidence from public.opportunities o where o.id = chosen;
      end if;
    else
      select array_agg(o.id) into hits from public.opportunities o
      where o.user_id = m.user_id and o.record_state = 'active'
        and length(o.role_title) >= 6 and position(lower(o.role_title) in haystack) > 0;
      if cardinality(hits) = 1 then
        chosen := hits[1]; rule := 'role_title';
        select '岗位名“' || o.role_title || '”' into evidence from public.opportunities o where o.id = chosen;
      end if;
    end if;
  end if;

  -- Uniqueness is judged against every active job; a pair the user rejected or unlinked is
  -- then dropped rather than letting the next-best job look unique.
  if chosen is null or exists (
    select 1 from public.opportunity_communications c
    where c.gmail_message_id = m.id and c.opportunity_id = chosen and c.status in ('rejected', 'unlinked')
  ) then
    return null;
  end if;
  insert into public.opportunity_communications (user_id, opportunity_id, gmail_message_id, match_rule, match_evidence)
  values (m.user_id, chosen, m.id, rule, left(evidence, 300))
  on conflict (gmail_message_id, opportunity_id) do nothing
  returning id into link_id;
  return link_id;
end;
$$;

create function private.suggest_communication_links_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.suggest_communication_links(new);
  return new;
end;
$$;

create trigger gmail_messages_suggest_links
  after insert or update of classification, subject, sender_summary, summary on public.gmail_messages
  for each row execute function private.suggest_communication_links_trigger();

-- User decisions. Owner-only; the privacy lock blocks every write.
create function private.decide_communication_link_impl(target_link_id uuid, target_decision text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  link public.opportunity_communications%rowtype;
  next_status text;
  subject text;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_decision not in ('confirm', 'reject', 'unlink') then
    raise exception 'invalid_link_decision' using errcode = '22023';
  end if;
  select * into link from public.opportunity_communications
  where id = target_link_id and user_id = actor_user_id for update;
  if not found then raise exception 'link_not_found' using errcode = 'P0002'; end if;

  next_status := case target_decision when 'confirm' then 'linked' when 'reject' then 'rejected' else 'unlinked' end;
  if link.status = next_status then return link.status; end if;
  if (target_decision = 'confirm' and link.status not in ('suggested', 'unlinked'))
    or (target_decision = 'reject' and link.status <> 'suggested')
    or (target_decision = 'unlink' and link.status <> 'linked') then
    raise exception 'invalid_link_transition' using errcode = '23514';
  end if;
  if target_decision = 'confirm' and exists (
    select 1 from public.opportunity_communications c
    where c.gmail_message_id = link.gmail_message_id and c.status = 'linked' and c.id <> link.id
  ) then
    raise exception 'message_already_linked' using errcode = '23505';
  end if;

  update public.opportunity_communications set status = next_status, decided_at = now() where id = link.id;
  select m.subject into subject from public.gmail_messages m where m.id = link.gmail_message_id;

  if target_decision in ('confirm', 'unlink') then
    insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
    values (actor_user_id, 'opportunity', link.opportunity_id,
      case when target_decision = 'confirm' then 'communication_linked' else 'communication_unlinked' end, 'user',
      left(case when target_decision = 'confirm' then '已关联邮件：' else '已撤销邮件关联：' end || coalesce(nullif(subject, ''), '（无主题邮件）'), 500),
      jsonb_build_object('linkId', link.id, 'gmailMessageId', link.gmail_message_id, 'rule', link.match_rule));
  end if;
  insert into public.audit_events (
    user_id, actor_type, action, object_type, object_id, before_state, after_state, permission_decision, rule_version, outcome
  ) values (
    actor_user_id, 'user', 'communication.' || target_decision, 'opportunity_communication', link.id::text,
    jsonb_build_object('status', link.status, 'opportunityId', link.opportunity_id),
    jsonb_build_object('status', next_status, 'opportunityId', link.opportunity_id),
    jsonb_build_object('source', 'user_confirmation', 'externalAction', false, 'stageChanged', false),
    link.rule_version, 'succeeded'
  );
  return next_status;
end;
$$;

create function public.decide_my_communication_link(target_link_id uuid, target_decision text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.decide_communication_link_impl(target_link_id, target_decision);
end;
$$;

revoke all on function private.mail_link_domain(text) from public, anon, authenticated;
revoke all on function private.mail_link_company_key(text) from public, anon, authenticated;
revoke all on function private.suggest_communication_links(public.gmail_messages) from public, anon, authenticated;
revoke all on function private.suggest_communication_links_trigger() from public, anon, authenticated;
revoke all on function private.decide_communication_link_impl(uuid, text) from public, anon;
grant execute on function private.decide_communication_link_impl(uuid, text) to authenticated, service_role;
revoke all on function public.decide_my_communication_link(uuid, text) from public, anon;
grant execute on function public.decide_my_communication_link(uuid, text) to authenticated, service_role;

-- Backfill suggestions for job e-mails that already exist.
do $$
declare
  message public.gmail_messages%rowtype;
begin
  for message in select * from public.gmail_messages where classification = 'job' loop
    perform private.suggest_communication_links(message);
  end loop;
end;
$$;
