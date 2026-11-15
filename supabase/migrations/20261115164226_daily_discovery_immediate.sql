-- Explicit immediate execution may run before 09:00. Daily deduplication,
-- settings, permissions, budget and service-only grants are unchanged.
do $$
declare definition text; original text := '(now() at time zone ''Asia/Shanghai'')::time < time ''09:00''';
begin
 select pg_get_functiondef('public.daily_discovery_work(uuid,text,jsonb)'::regprocedure) into definition;
 if position(original in definition)=0 then raise exception 'daily_time_guard_not_found'; end if;
 definition:=replace(definition,original,'('||original||' and coalesce(payload->>''immediate'',''false'')<>''true'')');
 execute definition;
end $$;
