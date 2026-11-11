-- Issue #18: batch triage of the candidate pool (track / apply / later / dismissed).
-- One call handles up to 100 candidates. Each item runs in its own subtransaction, so a
-- failing item is reported without rolling back the others. Re-applying the same decision
-- is a no-op ("unchanged"). Promotion reuses promote_opportunity_candidate; candidates never
-- enter the long-term table without this explicit user choice, and nothing is submitted.

create function public.decide_my_candidates(
  target_candidate_ids uuid[],
  target_decision text,
  target_reason text default null
)
returns table(candidate_id uuid, outcome text, opportunity_id uuid, error_code text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  item_id uuid;
  candidate public.opportunity_candidates%rowtype;
  reason text := nullif(btrim(coalesce(target_reason, '')), '');
  promoted_id uuid;
begin
  if actor_user_id is null or not private.m3_writes_allowed(actor_user_id) then
    raise exception 'privacy_locked' using errcode = '42501';
  end if;
  if target_decision not in ('track', 'apply', 'later', 'dismissed') then
    raise exception 'invalid_candidate_decision' using errcode = '22023';
  end if;
  if target_candidate_ids is null or cardinality(target_candidate_ids) not between 1 and 100 then
    raise exception 'invalid_candidate_batch' using errcode = '22023';
  end if;
  if reason is not null and char_length(reason) > 1000 then
    raise exception 'invalid_candidate_batch' using errcode = '22023';
  end if;
  if target_decision = 'dismissed' and reason is null then
    raise exception 'dismiss_reason_required' using errcode = '22023';
  end if;

  foreach item_id in array (select array_agg(distinct x) from unnest(target_candidate_ids) as x) loop
    begin
      select * into candidate from public.opportunity_candidates c
      where c.id = item_id and c.user_id = actor_user_id
      for update;
      if not found then
        raise exception 'candidate_not_found' using errcode = 'P0002';
      end if;

      if target_decision in ('track', 'apply') then
        if candidate.decision_status = 'promoted' then
          candidate_id := item_id; outcome := 'unchanged'; opportunity_id := candidate.promoted_opportunity_id; error_code := null;
          return next;
          continue;
        end if;
        promoted_id := public.promote_opportunity_candidate(item_id, target_decision);
        candidate_id := item_id; outcome := 'promoted'; opportunity_id := promoted_id; error_code := null;
        return next;
        continue;
      end if;

      if candidate.decision_status = 'promoted' then
        raise exception 'candidate_already_promoted' using errcode = '23514';
      end if;
      if candidate.decision_status = target_decision
        and candidate.decision_reason is not distinct from coalesce(reason, candidate.decision_reason) then
        candidate_id := item_id; outcome := 'unchanged'; opportunity_id := null; error_code := null;
        return next;
        continue;
      end if;

      update public.opportunity_candidates c
      set decision_status = target_decision,
          decision_reason = coalesce(reason, c.decision_reason),
          version = c.version + 1,
          updated_at = now()
      where c.id = item_id;

      insert into public.timeline_entries (
        user_id, entity_type, entity_id, event_type, actor_type, summary, changes
      ) values (
        actor_user_id, 'candidate', item_id, 'decision_changed', 'user',
        case target_decision when 'later' then '已标记为稍后处理' else '已标记为不考虑' end,
        jsonb_build_object('from', candidate.decision_status, 'to', target_decision, 'batch', true)
      );
      insert into public.audit_events (
        user_id, actor_type, action, object_type, object_id, before_state, after_state,
        permission_decision, outcome
      ) values (
        actor_user_id, 'user', 'candidate.decide', 'candidate', item_id::text,
        jsonb_build_object('decisionStatus', candidate.decision_status),
        jsonb_build_object('decisionStatus', target_decision, 'hasReason', reason is not null, 'batch', true),
        jsonb_build_object('source', 'user_confirmation', 'externalAction', false), 'succeeded'
      );
      candidate_id := item_id; outcome := 'updated'; opportunity_id := null; error_code := null;
      return next;
    exception when others then
      candidate_id := item_id; outcome := 'failed'; opportunity_id := null;
      error_code := case when sqlerrm ~ '^[a-z_]{3,60}$' then sqlerrm else 'candidate_update_failed' end;
      return next;
    end;
  end loop;
end;
$$;

revoke all on function public.decide_my_candidates(uuid[], text, text) from public, anon;
grant execute on function public.decide_my_candidates(uuid[], text, text) to authenticated, service_role;
