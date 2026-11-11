-- Persist the private product marker observed from Google. This keeps the
-- write boundary enforceable without inferring ownership from a local link.
alter table public.calendar_events
  add column product_owned boolean not null default false,
  add column product_action_id uuid references public.actions(id) on delete set null,
  add constraint calendar_event_product_marker_shape check (
    (product_owned and product_action_id is not null)
    or (not product_owned and product_action_id is null)
  );

create index calendar_events_product_action_idx
  on public.calendar_events (user_id, product_action_id)
  where product_owned;
