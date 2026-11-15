-- User confirmed three directions; manual search settings remain independent.
create function private.daily_discovery_preferences() returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('direction','二级买方,二级卖方,PEVC','profile','目标方向：二级买方投研、二级卖方研究、一级PEVC。岗位含金量由AI根据原文判断。')
$$;
revoke all on function private.daily_discovery_preferences() from public,anon,authenticated;
-- Amend only the newly introduced worker bridge, never historical migrations.
do $$
declare definition text;
begin
 select pg_get_functiondef('public.daily_discovery_work(uuid,text,jsonb)'::regprocedure) into definition;
 definition:=replace(definition,'jsonb_build_object(''source'',''all'',''publishedWithin'',''7'')','jsonb_build_object(''source'',''all'',''publishedWithin'',''7'')||private.daily_discovery_preferences()');
 definition:=replace(definition,'rid:=private.manual_radar(''start'',result);', $replacement$
   begin
    if not exists(select 1 from private.evaluate_permission(target_user_id,'job_radar.scoring',null) where allowed)
     then raise exception 'ai_permission_denied'; end if;
    rid:=private.manual_radar('start',result);
   exception when others then
    insert into private.daily_discovery_reports(user_id,report_day,revision,status,error_code,finished_at)
     values(target_user_id,day,s.revision,'failed','permission_or_start_failed',now());
    perform set_config('request.jwt.claim.sub',coalesce(prior_sub,''),true);
    perform set_config('request.jwt.claims',coalesce(prior_claims,''),true);
    return null;
   end;
 $replacement$);
 definition:=replace(definition,'when payload->>''error'' is not null then ''failed'' else ''completed'' end,', 'when payload->>''error'' is not null then ''failed'' else ''completed'' end,');
 execute definition;
end $$;
