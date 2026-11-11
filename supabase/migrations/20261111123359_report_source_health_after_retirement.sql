do $migration$
declare definition text; updated_definition text;
begin
  definition:=pg_get_functiondef('private.generate_report(uuid,text,text,uuid)'::regprocedure);
  updated_definition:=replace(definition,
    $old$jsonb_build_array('gmail', 'wechat', 'job_radar_ai')$old$,
    $new$jsonb_build_array('job_radar_ai') || case when exists (
      select 1 from public.external_connections ec
      where ec.user_id=target_user_id and ec.provider='gmail' and ec.status='connected'
        and ec.last_success_at>now()-interval '30 minutes'
    ) then '[]'::jsonb else '["gmail"]'::jsonb end$new$);
  if definition=updated_definition then raise exception 'unexpected_report_health_definition'; end if;
  execute updated_definition;
end $migration$;
