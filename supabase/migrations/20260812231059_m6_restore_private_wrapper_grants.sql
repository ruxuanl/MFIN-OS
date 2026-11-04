-- M6 regression fix: the Gmail migration's blanket private-function revoke
-- removed execute privileges required by pre-existing authenticated invoker
-- wrappers. Restore only the reviewed M4/M5 narrow implementations; Gmail
-- system mutation functions remain service-role-only.
grant execute on function private.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function private.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function private.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;
grant execute on function private.ensure_my_report_schedules() to authenticated, service_role;
grant execute on function private.update_my_report_schedule(text, boolean, time) to authenticated, service_role;
grant execute on function private.generate_my_report(text) to authenticated, service_role;
grant execute on function private.enqueue_my_smart_notification(text, text, text, text, text, text) to authenticated, service_role;
