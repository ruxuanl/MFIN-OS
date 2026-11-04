alter table public.gmail_attachments
  drop constraint gmail_attachments_size_bytes_check;

alter table public.gmail_attachments
  add constraint gmail_attachments_size_bytes_check
  check (size_bytes between 0 and 52428800);
