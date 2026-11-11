-- M7's defensive blanket revoke also removed the reviewed private
-- implementations used by existing authenticated public invoker wrappers.
-- Restore only those narrow M4/M5 entry points; public and anon stay denied.
revoke all on function private.set_my_calendar_connection_status(text) from public, anon;
revoke all on function private.queue_action_calendar_sync(uuid, boolean) from public, anon;
revoke all on function private.resolve_calendar_sync_conflict(uuid, text) from public, anon;
revoke all on function private.ensure_my_report_schedules() from public, anon;
revoke all on function private.update_my_report_schedule(text, boolean, time) from public, anon;
revoke all on function private.generate_my_report(text) from public, anon;
revoke all on function private.enqueue_my_smart_notification(text, text, text, text, text, text) from public, anon;

grant execute on function private.set_my_calendar_connection_status(text) to authenticated, service_role;
grant execute on function private.queue_action_calendar_sync(uuid, boolean) to authenticated, service_role;
grant execute on function private.resolve_calendar_sync_conflict(uuid, text) to authenticated, service_role;
grant execute on function private.ensure_my_report_schedules() to authenticated, service_role;
grant execute on function private.update_my_report_schedule(text, boolean, time) to authenticated, service_role;
grant execute on function private.generate_my_report(text) to authenticated, service_role;
grant execute on function private.enqueue_my_smart_notification(text, text, text, text, text, text) to authenticated, service_role;
