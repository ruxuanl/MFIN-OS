-- Read confirmation is a submitted substage; the canonical nine-stage model is
-- unchanged. Reuse Gmail evidence, updates, undo and the append-only timeline.
alter table public.gmail_updates drop constraint gmail_updates_update_type_check;
alter table public.gmail_updates add constraint gmail_updates_update_type_check
  check (update_type in ('interview_invitation', 'read_confirmed', 'assessment_invitation', 'offer_notification'));
alter table public.gmail_updates add column applied_version bigint;

create or replace function public.apply_gmail_recruitment_update(
  target_user_id uuid, target_inbox_item_id uuid, target_opportunity_id uuid, target_stage text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  item public.inbox_items%rowtype;
  message public.gmail_messages%rowtype;
  opportunity public.opportunities%rowtype;
  decision record;
  stage_main text;
  stage_sub text;
  kind text;
  current_rank integer;
  target_rank integer;
  audit_id uuid;
  undo_id uuid;
  update_id uuid;
  created_action uuid;
  resulting_version bigint;
  advance boolean;
begin
  if target_stage is null or target_stage not in ('read_confirmed','assessment','interview','offer') then
    raise exception 'invalid_recruitment_stage' using errcode = '22023';
  end if;
  -- Serialize Gmail stage writes for this owner, then recheck runtime gates.
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));
  select * into decision from private.evaluate_permission(target_user_id, 'gmail.rules_status_update', null);
  if not coalesce(decision.allowed, false)
    or exists (select 1 from public.privacy_locks where user_id = target_user_id and is_locked)
    or not exists (select 1 from public.external_connections where user_id = target_user_id and provider = 'gmail' and status = 'connected') then
    raise exception 'gmail_status_update_denied' using errcode = '42501';
  end if;
  select * into item from public.inbox_items where id = target_inbox_item_id and user_id = target_user_id for update;
  if not found then raise exception 'gmail_inbox_item_not_found' using errcode = 'P0002'; end if;
  select id into update_id from public.gmail_updates where inbox_item_id = item.id;
  if found then return update_id; end if;
  if item.status <> 'pending' or item.item_type <> 'email_update' or item.target_type <> 'opportunity'
    or item.target_id is distinct from target_opportunity_id then return null; end if;
  select * into message from public.gmail_messages where id = item.gmail_message_id and user_id = target_user_id;
  if not found or message.classification <> 'job' or message.confidence < 0.98 or message.evidence_id is null then return null; end if;
  select * into opportunity from public.opportunities where id = target_opportunity_id and user_id = target_user_id for update;
  if not found or opportunity.record_state <> 'active' or opportunity.main_stage in ('new','evaluation','preparation','ended') then return null; end if;
  if exists (select 1 from public.field_locks where user_id = target_user_id and object_type = 'opportunity'
    and object_id = target_opportunity_id::text and field_path in ('main_stage','substage') and unlocked_at is null) then return null; end if;

  stage_main := case target_stage when 'read_confirmed' then 'submitted' when 'assessment' then 'test' else target_stage end;
  stage_sub := case target_stage when 'read_confirmed' then 'Read Confirmed' when 'assessment' then 'OA / Assessment（邮件）' when 'interview' then '面试（邮件）' else 'Offer（邮件）' end;
  kind := case target_stage when 'read_confirmed' then 'read_confirmed' when 'assessment' then 'assessment_invitation' when 'interview' then 'interview_invitation' else 'offer_notification' end;
  target_rank := case target_stage when 'read_confirmed' then 1 when 'assessment' then 2 when 'interview' then 3 else 4 end;
  current_rank := case opportunity.main_stage when 'offer' then 4 when 'interview' then 3 when 'test' then 2 when 'submitted' then case when opportunity.substage = 'Read Confirmed' then 1 else 0 end else 0 end;
  if opportunity.main_stage = 'waiting' then
    select coalesce(max(case stage.value when 'offer' then 4 when 'interview' then 3 when 'test' then 2 else 0 end),0)
    into current_rank from public.timeline_entries t
    cross join lateral (values (t.changes->>'to_stage'),(t.changes->>'from_stage'),
      (t.changes->'patch'->>'main_stage'),(t.changes->'before'->>'main_stage')) stage(value)
    where t.user_id=target_user_id and t.entity_type='opportunity' and t.entity_id=opportunity.id;
  end if;
  -- Repeated opens / repeated invitations must not create another stage event,
  -- action or undo record. Late evidence can add history without regressing state.
  if exists (select 1 from public.gmail_updates where user_id = target_user_id and opportunity_id = opportunity.id and update_type = kind and status = 'applied')
    or (current_rank = target_rank and opportunity.main_stage = stage_main) then return null; end if;
  advance := target_rank > current_rank;
  resulting_version := opportunity.version;
  if advance then
    update public.opportunities set main_stage = stage_main, substage = stage_sub, version = version + 1
    where id = opportunity.id returning version into resulting_version;
  end if;
  if message.needs_action and target_stage <> 'read_confirmed' then
    insert into public.actions (user_id, context_type, context_id, track, title, due_at, priority, status, waiting_on, completion_criteria)
    values (target_user_id, 'opportunity', opportunity.id, opportunity.track, message.action_title, message.action_due_at,
      'high', 'unscheduled', 'user', '根据 Gmail 证据完成，由用户确认结果') returning id into created_action;
  end if;
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state,
    permission_decision, rule_version, confidence, outcome, reversible, undo_deadline)
  values (target_user_id, 'sync', 'gmail.recruitment_stage_applied', 'opportunity', opportunity.id::text,
    jsonb_build_object('main_stage', opportunity.main_stage, 'substage', opportunity.substage),
    jsonb_build_object('main_stage', case when advance then stage_main else opportunity.main_stage end,
      'substage', case when advance then stage_sub else opportunity.substage end, 'stage_evidence', target_stage),
    jsonb_build_object('status_update', decision.reason), 'recruitment_rules_v1', message.confidence, 'succeeded', true, now() + interval '30 days')
    returning id into audit_id;
  insert into public.audit_event_evidence (audit_event_id, evidence_id) values (audit_id, message.evidence_id);
  insert into public.undo_operations (user_id, audit_event_id, operation_type, compensation_payload, expires_at)
  values (target_user_id, audit_id, 'gmail_interview_update', jsonb_build_object('opportunity_id', opportunity.id,
    'previous_main_stage', opportunity.main_stage, 'previous_substage', opportunity.substage, 'action_id', created_action), now() + interval '30 days') returning id into undo_id;
  insert into public.gmail_updates (user_id,inbox_item_id,update_type,opportunity_id,previous_main_stage,previous_substage,action_id,audit_event_id,undo_operation_id,applied_version)
  values (target_user_id,item.id,kind,opportunity.id,opportunity.main_stage,opportunity.substage,created_action,audit_id,undo_id,resulting_version) returning id into update_id;
  insert into public.timeline_entries (user_id,entity_type,entity_id,event_type,actor_type,summary,changes)
  values (target_user_id,'opportunity',opportunity.id,'gmail_recruitment_stage','sync','Gmail 招聘阶段证据：' || stage_sub,
    jsonb_build_object('from_stage',opportunity.main_stage,'to_stage',stage_main,'to_substage',stage_sub,
      'inbox_item_id',item.id,'gmail_update_id',update_id,'evidence_id',message.evidence_id,'history_only',not advance));
  update public.inbox_items set status='auto_applied',action_id=created_action,resolved_at=now() where id=item.id;
  return update_id;
end;
$$;
revoke all on function public.apply_gmail_recruitment_update(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.apply_gmail_recruitment_update(uuid,uuid,uuid,text) to service_role;

-- Refuse a stale undo rather than overwriting a later manual or mail update.
do $$ declare definition text; begin
  select pg_get_functiondef('public.undo_my_gmail_update(uuid)'::regprocedure) into definition;
  definition := replace(definition, '  update public.opportunities' || chr(10),
    '  perform 1 from public.opportunities where id = update_record.opportunity_id and user_id = auth.uid() for update;' || chr(10) || '  if update_record.applied_version is not null and not exists (select 1 from public.opportunities where id = update_record.opportunity_id and user_id = auth.uid() and version = update_record.applied_version) then raise exception ''gmail_update_changed_since_apply'' using errcode = ''40001''; end if;' || chr(10) || '  update public.opportunities' || chr(10));
  execute definition;
end $$;

-- Undo previously used SECURITY INVOKER although its Gmail tables deliberately
-- grant authenticated users SELECT only. Keep table writes closed and expose
-- only this owner-checking, audited, privacy-checked transaction.
alter function public.undo_my_gmail_update(uuid) security definer;

-- Recruitment updates may also contain an actionable invitation. A user can
-- confirm that task without changing the recruitment stage or mail read state.
do $$ declare definition text; original text; begin
  select pg_get_functiondef('private.resolve_my_inbox_item(uuid,text)'::regprocedure) into definition;
  original := definition;
  definition := replace(definition, 'item_record.item_type = ''email_action''',
    '(item_record.item_type = ''email_action'' or (item_record.item_type = ''email_update'' and exists (select 1 from public.gmail_messages where id = item_record.gmail_message_id and user_id = auth.uid() and needs_action)))');
  if original = definition then raise exception 'inbox_task_implementation_not_found'; end if;
  execute definition;
end $$;
