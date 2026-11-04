-- M5 advisor hardening: partial composite indexes help product queries; these
-- covering indexes ensure FK maintenance can use the leading referenced column.

create index report_items_action_id_idx
  on public.report_items (action_id)
  where action_id is not null;
create index report_items_opportunity_id_idx
  on public.report_items (opportunity_id)
  where opportunity_id is not null;
create index reports_automation_run_id_idx
  on public.reports (automation_run_id)
  where automation_run_id is not null;
