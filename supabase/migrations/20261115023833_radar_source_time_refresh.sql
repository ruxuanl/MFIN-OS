CREATE OR REPLACE FUNCTION public.finish_manual_radar(target_run_id uuid, target_items jsonb, target_error text, target_ai jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r private.radar_runs%rowtype; item jsonb; usage public.ai_usage_events%rowtype; permitted boolean;
begin
 select * into r from private.radar_runs where id=target_run_id for update;
 if not found or r.status<>'running' then raise exception 'run_not_active'; end if;
 -- Settle known billed usage even if the user revoked permission during the call.
 if target_ai is not null and r.ai_usage_id is not null then
  select * into usage from public.ai_usage_events where id=r.ai_usage_id and user_id=r.user_id for update;
  if usage.status='reserved' and (target_ai->>'cost')::integer between 0 and usage.reserved_hkd_cents then
   update public.ai_usage_events set status='completed',model=target_ai->>'model',actual_hkd_cents=(target_ai->>'cost')::integer,
    input_tokens=(target_ai->>'inputTokens')::integer,output_tokens=(target_ai->>'outputTokens')::integer,finished_at=now() where id=usage.id;
  end if;
 end if;
 select coalesce(bool_or(allowed),false) into permitted from private.evaluate_permission(r.user_id,'job_radar.discovery',null);
 if not permitted or r.created_at<now()-interval '3 minutes' then
  update private.radar_runs set status='cancelled',error='permission_revoked_or_expired',finished_at=now() where id=r.id; return;
 end if;
 if target_items is null or jsonb_typeof(target_items)<>'array' or jsonb_array_length(target_items)>10 or pg_column_size(target_items)>131072 then raise exception 'invalid_results'; end if;
 for item in select value from jsonb_array_elements(target_items) loop
  insert into private.radar_results as saved(user_id,run_id,url,item) values(r.user_id,r.id,item->>'url',item)
   on conflict(user_id,url) do update set item = saved.item || jsonb_build_object(
    'summary',excluded.item->'summary','jdSummary',excluded.item->'jdSummary',
    'category',excluded.item->'category','locationZh',excluded.item->'locationZh',
    'isRecruiting',excluded.item->'isRecruiting','warning',excluded.item->'warning','reason',excluded.item->'reason')
   where not (saved.item ? 'summary') and excluded.item ? 'summary'
    and saved.item->>'evidence' = excluded.item->>'evidence'
    and target_ai is not null
    and exists(select 1 from private.evaluate_permission(r.user_id,'job_radar.scoring',null) where allowed);
 end loop;
 if target_error is null then
  -- Source dates may refresh; evidence and user decisions remain immutable.
  update private.radar_results as saved
   set item = saved.item || jsonb_build_object(
    'sourceTime', incoming.value->'sourceTime',
    'sourceObservedAt', incoming.value->'sourceObservedAt')
   from jsonb_array_elements(target_items) as incoming(value)
   where saved.user_id=r.user_id and saved.url=incoming.value->>'url'
    and saved.item->>'evidence'=incoming.value->>'evidence'
    and jsonb_typeof(incoming.value->'sourceTime')='object'
    and incoming.value->'sourceTime'->>'from' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and incoming.value->'sourceTime'->>'to' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$';
 end if;

 update private.radar_runs set status=case when target_error is null then 'completed' else 'failed' end,
  error=left(target_error,120),finished_at=now(),ai_model=target_ai->>'model' where id=r.id;
 insert into public.audit_events(user_id,actor_type,action,object_type,object_id,after_state,outcome)
  values(r.user_id,'system','radar.finished','radar_run',r.id::text,
   jsonb_build_object('results',jsonb_array_length(target_items),'searchCreditLimit',1),case when target_error is null then 'succeeded' else 'failed' end);
end; $function$
