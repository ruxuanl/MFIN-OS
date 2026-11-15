grant select,insert,update,delete on private.daily_discovery_settings,private.daily_discovery_reports to service_role;
grant execute on function private.manual_radar(text,jsonb),private.daily_discovery_preferences() to service_role;
alter table private.daily_discovery_reports add constraint daily_recommendations_bounded
 check(jsonb_typeof(recommendations)='array' and jsonb_array_length(recommendations)<=5 and pg_column_size(recommendations)<=65536);
