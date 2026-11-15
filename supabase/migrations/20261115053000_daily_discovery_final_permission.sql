do $$ declare definition text; begin
 select pg_get_functiondef('public.daily_discovery_work(uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,
  'or not exists(select 1 from private.radar_runs where id=r.run_id and status=''completed'')',
  'or not exists(select 1 from private.evaluate_permission(target_user_id,''job_radar.scoring'',null) where allowed)
   or (payload->>''error'' is null and not exists(select 1 from private.radar_runs where id=r.run_id and status=''completed''))');
 execute definition;
end $$;
