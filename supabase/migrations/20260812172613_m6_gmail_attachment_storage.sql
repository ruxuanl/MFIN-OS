-- M6 attachment imports use a private bucket. Browser clients receive no
-- Storage Object write policy; service-only processing downloads from Gmail,
-- validates the bounded payload, and writes/deletes the object.

insert into storage.buckets (id, name, public, file_size_limit)
values ('gmail-attachments', 'gmail-attachments', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists gmail_attachments_storage_read_own on storage.objects;
create policy gmail_attachments_storage_read_own on storage.objects
for select to authenticated
using (
  bucket_id = 'gmail-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.gmail_attachments ga
    where ga.user_id = (select auth.uid())
      and ga.storage_path = storage.objects.name
      and ga.import_status = 'imported'
  )
);
