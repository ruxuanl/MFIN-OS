-- M5 evening closeout: each unfinished action receives an explicit user outcome.

create or replace function public.close_out_my_action(
  target_action_id uuid,
  target_outcome text,
  target_reschedule_at timestamptz default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare action_record public.actions%rowtype;
declare next_status text;
declare next_priority text;
declare next_waiting_on text;
declare next_due_at timestamptz;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if not private.m3_writes_allowed(auth.uid()) then raise exception 'privacy_locked' using errcode = '42501'; end if;
  if target_outcome not in ('completed', 'continue', 'waiting', 'cancelled', 'downgraded', 'rescheduled') then
    raise exception 'invalid_closeout_outcome' using errcode = '22023';
  end if;
  if target_outcome = 'rescheduled' and target_reschedule_at is null then
    raise exception 'reschedule_time_required' using errcode = '22023';
  end if;
  select * into action_record from public.actions
  where id = target_action_id and user_id = auth.uid() for update;
  if not found then raise exception 'action_not_found' using errcode = 'P0002'; end if;
  if action_record.status in ('completed', 'cancelled') then return jsonb_build_object('status', action_record.status, 'version', action_record.version); end if;

  next_status := case target_outcome when 'completed' then 'completed' when 'cancelled' then 'cancelled' when 'waiting' then 'waiting' when 'rescheduled' then 'scheduled' else action_record.status end;
  next_priority := case target_outcome when 'downgraded' then case action_record.priority when 'critical' then 'high' when 'high' then 'normal' else 'low' end else action_record.priority end;
  next_waiting_on := case target_outcome when 'waiting' then 'other_party' when 'continue' then 'user' else action_record.waiting_on end;
  next_due_at := case target_outcome when 'rescheduled' then target_reschedule_at else action_record.due_at end;

  update public.actions set
    status = next_status, priority = next_priority, waiting_on = next_waiting_on,
    due_at = next_due_at,
    completed_at = case when next_status = 'completed' then now() else null end,
    cancelled_at = case when next_status = 'cancelled' then now() else null end,
    version = version + 1
  where id = action_record.id;

  insert into public.timeline_entries (user_id, entity_type, entity_id, event_type, actor_type, summary, changes)
  values (auth.uid(), 'action', action_record.id, 'evening_closeout', 'user', '用户完成晚间收尾',
    jsonb_build_object('outcome', target_outcome, 'beforeStatus', action_record.status, 'afterStatus', next_status, 'dueAt', next_due_at));
  insert into public.audit_events (user_id, actor_type, action, object_type, object_id, before_state, after_state, permission_decision, outcome)
  values (auth.uid(), 'user', 'action.evening_closeout', 'action', action_record.id::text,
    jsonb_build_object('status', action_record.status, 'priority', action_record.priority, 'dueAt', action_record.due_at),
    jsonb_build_object('status', next_status, 'priority', next_priority, 'dueAt', next_due_at, 'outcome', target_outcome),
    jsonb_build_object('source', 'user_confirmation'), 'succeeded');
  return jsonb_build_object('status', next_status, 'version', action_record.version + 1);
end;
$$;

revoke execute on function public.close_out_my_action(uuid, text, timestamptz) from public, anon;
grant execute on function public.close_out_my_action(uuid, text, timestamptz) to authenticated, service_role;
