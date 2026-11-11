-- M5 notification boundary (ordered before M6). Remove the inherited table-level UPDATE privilege before granting the only
-- client-editable notification field. Delivery status remains system-owned.

revoke update on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;
