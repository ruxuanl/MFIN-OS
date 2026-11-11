alter table public.gmail_attachments
  drop constraint gmail_attachments_provider_attachment_id_check;

alter table public.gmail_attachments
  add constraint gmail_attachments_provider_attachment_id_check
  check (length(provider_attachment_id) between 1 and 2048);
