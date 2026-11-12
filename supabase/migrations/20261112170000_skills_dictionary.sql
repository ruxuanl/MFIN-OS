-- Issue #16 (D30, D34): rule skills dictionary, job ↔ skill and resume ↔ skill links, resume gap,
-- companies, and a structured multi-hop opportunity query. No AI, no graph database.
-- * skill_definitions mirrors apps/web/src/lib/skills/dictionary.ts (skills_dict_v1).
-- * Skills are re-extracted by triggers. A skill the user added or removed is locked and never
--   overwritten by re-extraction.
-- * Resume text (D30) lives in private.resume_version_texts, unreachable from the Data API.

create table public.skill_definitions (
  skill_key text primary key check (skill_key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null check (length(label) between 1 and 80),
  category text not null check (category in ('tool', 'technical', 'finance', 'credential', 'language')),
  aliases text[] not null check (cardinality(aliases) between 1 and 12),
  patterns text[] not null check (cardinality(patterns) = cardinality(aliases)),
  dict_version text not null default 'skills_dict_v1' check (dict_version = 'skills_dict_v1')
);

insert into public.skill_definitions (skill_key, label, category, aliases, patterns) values
  ('python', 'Python', 'tool', array['python'], array['(^|[^a-z0-9+#])python($|[^a-z0-9+#])']),
  ('r', 'R', 'tool', array['r', 'r语言', 'r 语言'], array['(^|[^a-z0-9+#&])r($|[^a-z0-9+#&])', '(^|[^a-z0-9+#])r语言($|[^a-z0-9+#])', '(^|[^a-z0-9+#])r 语言($|[^a-z0-9+#])']),
  ('sql', 'SQL', 'tool', array['sql', 'mysql', 'postgresql'], array['(^|[^a-z0-9+#])sql($|[^a-z0-9+#])', '(^|[^a-z0-9+#])mysql($|[^a-z0-9+#])', '(^|[^a-z0-9+#])postgresql($|[^a-z0-9+#])']),
  ('excel', 'Excel', 'tool', array['excel'], array['(^|[^a-z0-9+#])excel($|[^a-z0-9+#])']),
  ('vba', 'VBA', 'tool', array['vba'], array['(^|[^a-z0-9+#])vba($|[^a-z0-9+#])']),
  ('matlab', 'MATLAB', 'tool', array['matlab'], array['(^|[^a-z0-9+#])matlab($|[^a-z0-9+#])']),
  ('stata', 'Stata', 'tool', array['stata'], array['(^|[^a-z0-9+#])stata($|[^a-z0-9+#])']),
  ('cpp', 'C++', 'tool', array['c++'], array['(^|[^a-z0-9+#])c\+\+($|[^a-z0-9+#])']),
  ('java', 'Java', 'tool', array['java'], array['(^|[^a-z0-9+#])java($|[^a-z0-9+#])']),
  ('tableau', 'Tableau', 'tool', array['tableau'], array['(^|[^a-z0-9+#])tableau($|[^a-z0-9+#])']),
  ('power_bi', 'Power BI', 'tool', array['power bi', 'powerbi'], array['(^|[^a-z0-9+#])power bi($|[^a-z0-9+#])', '(^|[^a-z0-9+#])powerbi($|[^a-z0-9+#])']),
  ('powerpoint', 'PowerPoint', 'tool', array['powerpoint', 'ppt'], array['(^|[^a-z0-9+#])powerpoint($|[^a-z0-9+#])', '(^|[^a-z0-9+#])ppt($|[^a-z0-9+#])']),
  ('bloomberg', 'Bloomberg', 'tool', array['bloomberg', '彭博'], array['(^|[^a-z0-9+#])bloomberg($|[^a-z0-9+#])', '彭博']),
  ('wind', 'Wind', 'tool', array['wind', '万得'], array['(^|[^a-z0-9+#])wind($|[^a-z0-9+#])', '万得']),
  ('capital_iq', 'Capital IQ', 'tool', array['capital iq', 'capiq'], array['(^|[^a-z0-9+#])capital iq($|[^a-z0-9+#])', '(^|[^a-z0-9+#])capiq($|[^a-z0-9+#])']),
  ('machine_learning', '机器学习', 'technical', array['machine learning', '机器学习'], array['(^|[^a-z0-9+#])machine learning($|[^a-z0-9+#])', '机器学习']),
  ('deep_learning', '深度学习', 'technical', array['deep learning', '深度学习'], array['(^|[^a-z0-9+#])deep learning($|[^a-z0-9+#])', '深度学习']),
  ('nlp', 'NLP', 'technical', array['nlp', '自然语言处理', 'natural language processing'], array['(^|[^a-z0-9+#])nlp($|[^a-z0-9+#])', '自然语言处理', '(^|[^a-z0-9+#])natural language processing($|[^a-z0-9+#])']),
  ('data_analysis', '数据分析', 'technical', array['data analysis', 'data analytics', '数据分析'], array['(^|[^a-z0-9+#])data analysis($|[^a-z0-9+#])', '(^|[^a-z0-9+#])data analytics($|[^a-z0-9+#])', '数据分析']),
  ('data_visualization', '数据可视化', 'technical', array['data visualization', '数据可视化'], array['(^|[^a-z0-9+#])data visualization($|[^a-z0-9+#])', '数据可视化']),
  ('statistics', '统计', 'technical', array['statistics', '统计学', '统计分析'], array['(^|[^a-z0-9+#])statistics($|[^a-z0-9+#])', '统计学', '统计分析']),
  ('econometrics', '计量经济学', 'technical', array['econometrics', '计量经济'], array['(^|[^a-z0-9+#])econometrics($|[^a-z0-9+#])', '计量经济']),
  ('quant', '量化', 'technical', array['quantitative', 'quant', '量化'], array['(^|[^a-z0-9+#])quantitative($|[^a-z0-9+#])', '(^|[^a-z0-9+#])quant($|[^a-z0-9+#])', '量化']),
  ('backtesting', '回测', 'technical', array['backtest', 'backtesting', '回测'], array['(^|[^a-z0-9+#])backtest($|[^a-z0-9+#])', '(^|[^a-z0-9+#])backtesting($|[^a-z0-9+#])', '回测']),
  ('financial_modeling', '财务建模', 'finance', array['financial modeling', 'financial modelling', '财务建模', '财务模型'], array['(^|[^a-z0-9+#])financial modeling($|[^a-z0-9+#])', '(^|[^a-z0-9+#])financial modelling($|[^a-z0-9+#])', '财务建模', '财务模型']),
  ('valuation', '估值', 'finance', array['valuation', 'dcf', '估值'], array['(^|[^a-z0-9+#])valuation($|[^a-z0-9+#])', '(^|[^a-z0-9+#])dcf($|[^a-z0-9+#])', '估值']),
  ('lbo', 'LBO', 'finance', array['lbo', '杠杆收购'], array['(^|[^a-z0-9+#])lbo($|[^a-z0-9+#])', '杠杆收购']),
  ('mna', '并购', 'finance', array['m&a', 'mergers and acquisitions', '并购'], array['(^|[^a-z0-9+#])m&a($|[^a-z0-9+#])', '(^|[^a-z0-9+#])mergers and acquisitions($|[^a-z0-9+#])', '并购']),
  ('ipo', 'IPO', 'finance', array['ipo', '首次公开发行'], array['(^|[^a-z0-9+#])ipo($|[^a-z0-9+#])', '首次公开发行']),
  ('due_diligence', '尽职调查', 'finance', array['due diligence', '尽职调查', '尽调'], array['(^|[^a-z0-9+#])due diligence($|[^a-z0-9+#])', '尽职调查', '尽调']),
  ('equity_research', '行业研究', 'finance', array['equity research', '行业研究', '行研'], array['(^|[^a-z0-9+#])equity research($|[^a-z0-9+#])', '行业研究', '行研']),
  ('accounting', '会计', 'finance', array['accounting', '会计'], array['(^|[^a-z0-9+#])accounting($|[^a-z0-9+#])', '会计']),
  ('risk_management', '风险管理', 'finance', array['risk management', '风险管理', '风控'], array['(^|[^a-z0-9+#])risk management($|[^a-z0-9+#])', '风险管理', '风控']),
  ('credit_analysis', '信用分析', 'finance', array['credit analysis', 'credit risk', '信用风险', '信用分析'], array['(^|[^a-z0-9+#])credit analysis($|[^a-z0-9+#])', '(^|[^a-z0-9+#])credit risk($|[^a-z0-9+#])', '信用风险', '信用分析']),
  ('fixed_income', '固定收益', 'finance', array['fixed income', '固定收益', '固收', '债券'], array['(^|[^a-z0-9+#])fixed income($|[^a-z0-9+#])', '固定收益', '固收', '债券']),
  ('derivatives', '衍生品', 'finance', array['derivatives', '衍生品'], array['(^|[^a-z0-9+#])derivatives($|[^a-z0-9+#])', '衍生品']),
  ('esg', 'ESG', 'finance', array['esg'], array['(^|[^a-z0-9+#])esg($|[^a-z0-9+#])']),
  ('cfa', 'CFA', 'credential', array['cfa'], array['(^|[^a-z0-9+#])cfa($|[^a-z0-9+#])']),
  ('cpa', 'CPA', 'credential', array['cpa', '注册会计师'], array['(^|[^a-z0-9+#])cpa($|[^a-z0-9+#])', '注册会计师']),
  ('frm', 'FRM', 'credential', array['frm'], array['(^|[^a-z0-9+#])frm($|[^a-z0-9+#])']),
  ('acca', 'ACCA', 'credential', array['acca'], array['(^|[^a-z0-9+#])acca($|[^a-z0-9+#])']),
  ('english', '英语', 'language', array['english', '英语', '英文'], array['(^|[^a-z0-9+#])english($|[^a-z0-9+#])', '英语', '英文']),
  ('mandarin', '普通话', 'language', array['mandarin', '普通话'], array['(^|[^a-z0-9+#])mandarin($|[^a-z0-9+#])', '普通话']),
  ('cantonese', '粤语', 'language', array['cantonese', '粤语', '广东话'], array['(^|[^a-z0-9+#])cantonese($|[^a-z0-9+#])', '粤语', '广东话']);

alter table public.skill_definitions enable row level security;
create policy skill_definitions_read on public.skill_definitions for select to authenticated using (true);
revoke all on table public.skill_definitions from public, anon, authenticated;
grant select on table public.skill_definitions to authenticated;
grant select on table public.skill_definitions to service_role;

-- Companies: one row per normalised company name per user, linked from opportunities.
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name_key text not null check (length(name_key) between 1 and 240),
  display_name text not null check (length(display_name) between 1 and 240),
  created_at timestamptz not null default now(),
  unique (user_id, name_key)
);
alter table public.companies enable row level security;
create policy companies_select_own on public.companies for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.companies from public, anon, authenticated;
grant select on table public.companies to authenticated;
grant select, insert, update, delete on table public.companies to service_role;

alter table public.opportunities add column company_id uuid references public.companies(id) on delete set null;
create index opportunities_company_idx on public.opportunities (company_id) where company_id is not null;

create function private.company_name_key(company text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(
    btrim(regexp_replace(lower(coalesce(company, '')), '（[^）]*）|\([^)]*\)', '', 'g')),
    '\s*(股份有限公司|有限责任公司|有限公司|集团|limited|ltd\.?|inc\.?|llc|plc|group)$', '')), '');
$$;

create function private.assign_opportunity_company()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  key text := coalesce(private.company_name_key(new.company), lower(btrim(new.company)));
  found_id uuid;
begin
  insert into public.companies (user_id, name_key, display_name)
  values (new.user_id, key, left(btrim(new.company), 240))
  on conflict (user_id, name_key) do nothing;
  select c.id into found_id from public.companies c where c.user_id = new.user_id and c.name_key = key;
  new.company_id := found_id;
  return new;
end;
$$;

create trigger opportunities_assign_company before insert or update of company on public.opportunities
  for each row execute function private.assign_opportunity_company();

-- Resume text (D30). Written only by the owner through store_my_resume_text.
create table private.resume_version_texts (
  resume_version_id uuid primary key references public.resume_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 100000),
  stored_at timestamptz not null default now()
);
revoke all on table private.resume_version_texts from public, anon, authenticated;

create table public.opportunity_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  skill_key text not null references public.skill_definitions(skill_key) on delete cascade,
  status text not null default 'active' check (status in ('active', 'removed')),
  source text not null check (source in ('rule', 'user')),
  locked boolean not null default false,
  evidence text check (evidence is null or length(evidence) <= 200),
  rule_version text not null default 'skills_dict_v1',
  updated_at timestamptz not null default now(),
  unique (opportunity_id, skill_key),
  constraint opportunity_skill_lock_shape check (source = 'rule' or locked)
);
create index opportunity_skills_user_skill_idx on public.opportunity_skills (user_id, skill_key) where status = 'active';

create table public.resume_version_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resume_version_id uuid not null references public.resume_versions(id) on delete cascade,
  skill_key text not null references public.skill_definitions(skill_key) on delete cascade,
  evidence text check (evidence is null or length(evidence) <= 200),
  rule_version text not null default 'skills_dict_v1',
  created_at timestamptz not null default now(),
  unique (resume_version_id, skill_key)
);
create index resume_version_skills_user_idx on public.resume_version_skills (user_id);

alter table public.opportunity_skills enable row level security;
alter table public.resume_version_skills enable row level security;
create policy opportunity_skills_select_own on public.opportunity_skills for select to authenticated using ((select auth.uid()) = user_id);
create policy resume_version_skills_select_own on public.resume_version_skills for select to authenticated using ((select auth.uid()) = user_id);
revoke all on table public.opportunity_skills, public.resume_version_skills from public, anon, authenticated;
grant select on table public.opportunity_skills, public.resume_version_skills to authenticated;
grant select, insert, update, delete on table public.opportunity_skills, public.resume_version_skills to service_role;

-- Rule extraction: one row per matched skill with an ~80-character evidence snippet.
create function private.extract_skills(source_text text)
returns table(skill_key text, evidence text)
language sql
stable
set search_path = ''
as $$
  select d.skill_key, (
    select left(btrim(regexp_replace(substr(source_text, greatest(1, hit.at - 30), 80), '\s+', ' ', 'g')), 200)
    from (
      select min(regexp_instr(lower(source_text), p)) filter (where regexp_instr(lower(source_text), p) > 0) as at
      from unnest(d.patterns) as p
    ) hit
  )
  from public.skill_definitions d
  where source_text is not null
    and exists (select 1 from unnest(d.patterns) as p where lower(source_text) ~ p);
$$;

create function private.refresh_opportunity_skills(o public.opportunities)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.opportunity_skills s where s.opportunity_id = o.id and s.source = 'rule' and not s.locked;
  insert into public.opportunity_skills (user_id, opportunity_id, skill_key, source, evidence)
  select o.user_id, o.id, e.skill_key, 'rule', e.evidence
  from private.extract_skills(concat_ws(E'\n', o.role_title, o.department, o.responsibilities, o.requirements, o.raw_jd)) e
  on conflict (opportunity_id, skill_key) do nothing;
end;
$$;

create function private.refresh_opportunity_skills_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_opportunity_skills(new);
  return new;
end;
$$;

create trigger opportunities_refresh_skills
  after insert or update of role_title, department, responsibilities, requirements, raw_jd on public.opportunities
  for each row execute function private.refresh_opportunity_skills_trigger();

create function private.refresh_resume_skills(target_version_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored private.resume_version_texts%rowtype;
  total integer;
begin
  select * into stored from private.resume_version_texts t where t.resume_version_id = target_version_id;
  delete from public.resume_version_skills s where s.resume_version_id = target_version_id;
  if stored.resume_version_id is null then return 0; end if;
  insert into public.resume_version_skills (user_id, resume_version_id, skill_key, evidence)
  select stored.user_id, target_version_id, e.skill_key, e.evidence from private.extract_skills(stored.body) e;
  get diagnostics total = row_count;
  return total;
end;
$$;

create function private.store_resume_text_impl(target_version_id uuid, target_text text)
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
  if target_text is null or length(btrim(target_text)) = 0 or length(target_text) > 100000 then
    raise exception 'invalid_resume_text' using errcode = '22023';
  end if;
  if not exists (select 1 from public.resume_versions v where v.id = target_version_id and v.user_id = actor_user_id) then
    raise exception 'resume_version_not_found' using errcode = 'P0002';
  end if;
  insert into private.resume_version_texts (resume_version_id, user_id, body)
  values (target_version_id, actor_user_id, target_text)
  on conflict (resume_version_id) do update set body = excluded.body, stored_at = now();
  return private.refresh_resume_skills(target_version_id);
end;
$$;

create function public.store_my_resume_text(target_version_id uuid, target_text text)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.store_resume_text_impl(target_version_id, target_text);
end;
$$;

-- Manual skill edits are locked against re-extraction.
create function private.set_opportunity_skill_impl(target_opportunity_id uuid, target_skill_key text, target_present boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  next_status text := case when target_present then 'active' else 'removed' end;
  previous text;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_present is null or not exists (select 1 from public.skill_definitions d where d.skill_key = target_skill_key) then
    raise exception 'invalid_skill' using errcode = '22023';
  end if;
  if not exists (select 1 from public.opportunities o where o.id = target_opportunity_id and o.user_id = actor_user_id) then
    raise exception 'opportunity_not_found' using errcode = 'P0002';
  end if;
  select s.status into previous from public.opportunity_skills s
  where s.opportunity_id = target_opportunity_id and s.skill_key = target_skill_key;
  insert into public.opportunity_skills (user_id, opportunity_id, skill_key, status, source, locked, evidence)
  values (actor_user_id, target_opportunity_id, target_skill_key, next_status, 'user', true, null)
  on conflict (opportunity_id, skill_key) do update
    set status = excluded.status, source = 'user', locked = true, updated_at = now();
  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (actor_user_id, 'opportunity', target_opportunity_id, 'skill_changed', 'user',
    left(case when target_present then '已手动标记技能：' else '已手动移除技能：' end
      || (select d.label from public.skill_definitions d where d.skill_key = target_skill_key), 500),
    jsonb_build_object('skill', target_skill_key, 'from', previous, 'to', next_status, 'locked', true));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state, permission_decision, rule_version, outcome)
  values (actor_user_id, 'user', 'opportunity.skill_set', 'opportunity', target_opportunity_id::text,
    jsonb_build_object('skill', target_skill_key, 'status', previous),
    jsonb_build_object('skill', target_skill_key, 'status', next_status, 'locked', true),
    jsonb_build_object('source', 'user_confirmation'), 'skills_dict_v1', 'succeeded');
  return next_status;
end;
$$;

create function public.set_my_opportunity_skill(target_opportunity_id uuid, target_skill_key text, target_present boolean)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  return private.set_opportunity_skill_impl(target_opportunity_id, target_skill_key, target_present);
end;
$$;

-- The resume a job is compared against: its current assignment, else the package's confirmed
-- version, else the newest version of the active master resume.
create function private.comparison_resume_version(target_user_id uuid, target_opportunity_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.resume_version_id from public.opportunity_resume_assignments a
      where a.user_id = target_user_id and a.opportunity_id = target_opportunity_id and a.is_current limit 1),
    (select p.selected_resume_version_id from public.application_packages p
      where p.user_id = target_user_id and p.opportunity_id = target_opportunity_id),
    (select v.id from public.resume_versions v join public.resume_documents d on d.id = v.document_id
      where v.user_id = target_user_id and d.document_kind = 'master' and d.archived_at is null
      order by v.version_number desc limit 1)
  );
$$;

create function public.get_my_opportunity_skills(target_opportunity_id uuid)
returns table(skill_key text, label text, category text, status text, source text, locked boolean, evidence text,
  in_resume boolean, resume_version_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  resume_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not exists (select 1 from public.opportunities o where o.id = target_opportunity_id and o.user_id = auth.uid()) then
    return;
  end if;
  resume_id := private.comparison_resume_version(auth.uid(), target_opportunity_id);
  return query
    select s.skill_key, d.label, d.category, s.status, s.source, s.locked, s.evidence,
      exists (select 1 from public.resume_version_skills r where r.resume_version_id = resume_id and r.skill_key = s.skill_key),
      resume_id
    from public.opportunity_skills s join public.skill_definitions d on d.skill_key = s.skill_key
    where s.opportunity_id = target_opportunity_id and s.user_id = auth.uid()
    order by s.status, d.category, d.label;
end;
$$;

-- Structured multi-hop query: job → skills → resume gap → linked e-mails.
-- "Replied" means a confirmed linked e-mail received after applying (#17), an applied Gmail
-- interview update, or a stage that implies a response (test / interview / offer / rejected).
create function public.query_my_opportunities(
  target_skills text[] default null,
  target_stages text[] default null,
  target_track text default null,
  target_location text default null,
  target_company text default null,
  target_replied boolean default null,
  target_resume_gap boolean default null,
  target_deadline_within_days integer default null,
  target_limit integer default 50
)
returns table(opportunity_id uuid, track text, company text, role_title text, main_stage text, deadline date,
  skills text[], missing_skills text[], replied boolean)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if exists (select 1 from public.privacy_locks l where l.user_id = auth.uid() and l.is_locked) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_limit not between 1 and 100 or coalesce(cardinality(target_skills), 0) > 8
    or (target_deadline_within_days is not null and target_deadline_within_days not between 0 and 365) then
    raise exception 'invalid_query' using errcode = '22023';
  end if;
  return query
    with base as (
      select o.*, private.comparison_resume_version(auth.uid(), o.id) as resume_id
      from public.opportunities o
      where o.user_id = auth.uid() and o.record_state = 'active'
        and (target_track is null or o.track = target_track)
        and (target_stages is null or o.main_stage = any(target_stages))
        and (target_location is null or o.location ilike '%' || target_location || '%')
        and (target_company is null or o.company_id in (
          select c.id from public.companies c where c.user_id = auth.uid()
            and c.name_key like '%' || coalesce(private.company_name_key(target_company), lower(target_company)) || '%'))
        and (target_deadline_within_days is null or (o.deadline is not null
          and o.deadline between (now() at time zone 'Asia/Hong_Kong')::date
            and (now() at time zone 'Asia/Hong_Kong')::date + target_deadline_within_days))
    ), enriched as (
      select b.*,
        coalesce(array(select s.skill_key from public.opportunity_skills s
          where s.opportunity_id = b.id and s.status = 'active' order by s.skill_key), '{}') as job_skills,
        coalesce(array(select s.skill_key from public.opportunity_skills s
          where s.opportunity_id = b.id and s.status = 'active'
            and not exists (select 1 from public.resume_version_skills r where r.resume_version_id = b.resume_id and r.skill_key = s.skill_key)
          order by s.skill_key), '{}') as gap_skills,
        (b.main_stage in ('test', 'interview', 'offer') or coalesce(b.close_reason = 'rejected', false)
          or exists (select 1 from public.opportunity_communications c join public.gmail_messages m on m.id = c.gmail_message_id
            where c.opportunity_id = b.id and c.status = 'linked' and m.received_at >= coalesce(b.applied_at, b.created_at))
          or exists (select 1 from public.gmail_updates u where u.opportunity_id = b.id and u.status = 'applied')) as has_reply
      from base b
    )
    select e.id, e.track, e.company, e.role_title, e.main_stage, e.deadline, e.job_skills, e.gap_skills, e.has_reply
    from enriched e
    where (target_skills is null or e.job_skills @> target_skills)
      and (target_replied is null or e.has_reply = target_replied)
      and (target_resume_gap is null or (target_resume_gap = (cardinality(
        case when target_skills is null then e.gap_skills
          else array(select x from unnest(e.gap_skills) x where x = any(target_skills)) end) > 0)))
    order by e.deadline nulls last, e.updated_at desc
    limit target_limit;
end;
$$;

revoke all on function private.company_name_key(text) from public, anon, authenticated;
revoke all on function private.assign_opportunity_company() from public, anon, authenticated;
revoke all on function private.extract_skills(text) from public, anon, authenticated;
revoke all on function private.refresh_opportunity_skills(public.opportunities) from public, anon, authenticated;
revoke all on function private.refresh_opportunity_skills_trigger() from public, anon, authenticated;
revoke all on function private.refresh_resume_skills(uuid) from public, anon, authenticated;
grant execute on function private.refresh_resume_skills(uuid) to service_role;
revoke all on function private.store_resume_text_impl(uuid, text) from public, anon;
grant execute on function private.store_resume_text_impl(uuid, text) to authenticated, service_role;
revoke all on function private.set_opportunity_skill_impl(uuid, text, boolean) from public, anon;
grant execute on function private.set_opportunity_skill_impl(uuid, text, boolean) to authenticated, service_role;
revoke all on function private.comparison_resume_version(uuid, uuid) from public, anon;
grant execute on function private.comparison_resume_version(uuid, uuid) to authenticated, service_role;
grant execute on function private.company_name_key(text) to authenticated, service_role;
revoke all on function public.store_my_resume_text(uuid, text) from public, anon;
grant execute on function public.store_my_resume_text(uuid, text) to authenticated, service_role;
revoke all on function public.set_my_opportunity_skill(uuid, text, boolean) from public, anon;
grant execute on function public.set_my_opportunity_skill(uuid, text, boolean) to authenticated, service_role;
revoke all on function public.get_my_opportunity_skills(uuid) from public, anon;
grant execute on function public.get_my_opportunity_skills(uuid) to authenticated, service_role;
revoke all on function public.query_my_opportunities(text[], text[], text, text, text, boolean, boolean, integer, integer) from public, anon;
grant execute on function public.query_my_opportunities(text[], text[], text, text, text, boolean, boolean, integer, integer) to authenticated, service_role;

-- Backfill: companies and skills for existing opportunities, without touching updated_at.
do $$
declare
  o public.opportunities%rowtype;
  key text;
begin
  for o in select * from public.opportunities loop
    key := coalesce(private.company_name_key(o.company), lower(btrim(o.company)));
    insert into public.companies (user_id, name_key, display_name) values (o.user_id, key, left(btrim(o.company), 240))
      on conflict (user_id, name_key) do nothing;
    perform private.refresh_opportunity_skills(o);
  end loop;
end;
$$;
