-- A use_product resolution acknowledges the currently mirrored provider version
-- before the product update is retried. The Action version remains ahead and is
-- still written through the normal ownership and If-Match checks.

create or replace function private.align_use_product_conflict_resolution()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'resolved' and new.resolution = 'use_product'
     and (old.status, old.resolution) is distinct from (new.status, new.resolution) then
    update public.calendar_event_links link
    set provider_etag = event.etag,
        last_synced_provider_updated_at = event.provider_updated_at
    from public.calendar_events event
    where link.id = new.event_link_id
      and event.id = link.calendar_event_id;
  end if;
  return new;
end;
$$;

drop trigger if exists calendar_conflict_align_use_product
on public.calendar_sync_conflicts;
create trigger calendar_conflict_align_use_product
after update of status, resolution on public.calendar_sync_conflicts
for each row execute function private.align_use_product_conflict_resolution();

revoke execute on function private.align_use_product_conflict_resolution()
from public, anon, authenticated;
