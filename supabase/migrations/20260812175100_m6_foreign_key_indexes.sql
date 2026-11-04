-- M6: covering indexes for relationship cleanup and evidence/audit lookups.
create index gmail_messages_evidence_idx on public.gmail_messages (evidence_id)
  where evidence_id is not null;
create index inbox_items_action_idx on public.inbox_items (action_id)
  where action_id is not null;
create index inbox_items_evidence_idx on public.inbox_items (evidence_id)
  where evidence_id is not null;
create index gmail_updates_action_idx on public.gmail_updates (action_id)
  where action_id is not null;
create index gmail_updates_calendar_operation_idx on public.gmail_updates (calendar_operation_id)
  where calendar_operation_id is not null;
create index gmail_updates_audit_event_idx on public.gmail_updates (audit_event_id);
create index gmail_updates_undo_operation_idx on public.gmail_updates (undo_operation_id)
  where undo_operation_id is not null;
