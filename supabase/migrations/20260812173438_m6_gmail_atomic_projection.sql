-- M6 hardening: persist the minimal Gmail projection, its evidence, unified
-- inbox item, and attachment metadata in one database transaction. This
-- prevents a failed sync attempt from leaving an orphaned partial projection.

create or replace function public.store_gmail_projection(
  target_user_id uuid,
  target_provider_message_id text,
  target_provider_thread_id text,
  target_history_id text,
  target_received_at timestamptz,
  target_source_identity text,
  target_classification text,
  target_sender_summary text,
  target_subject text,
  target_summary text,
  target_gmail_link text,
  target_needs_action boolean,
  target_action_title text,
  target_action_due_at timestamptz,
  target_confidence numeric,
  target_evidence_excerpt text,
  target_content_hash text,
  target_item_type text,
  target_inbox_classification text,
  target_inbox_title text,
  target_inbox_summary text,
  target_target_type text,
  target_target_id uuid,
  target_attachments jsonb default '[]'::jsonb
)
returns table (gmail_message_id uuid, inbox_item_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  evidence_id uuid;
  message_id uuid;
  item_id uuid;
  attachment jsonb;
begin
  if jsonb_typeof(target_attachments) <> 'array' then
    raise exception 'gmail_attachments_not_array' using errcode = '22023';
  end if;
  select id into message_id from public.gmail_messages
  where user_id = target_user_id and provider_message_id = target_provider_message_id;
  if found then
    select id into item_id from public.inbox_items where gmail_message_id = message_id;
    return query select message_id, item_id, false;
    return;
  end if;

  insert into public.evidence_refs (
    user_id, source_type, source_locator, content_hash, summary, last_verified_at
  ) values (
    target_user_id, 'gmail', target_gmail_link, target_content_hash,
    target_evidence_excerpt, now()
  ) returning id into evidence_id;

  insert into public.gmail_messages (
    user_id, provider_message_id, provider_thread_id, history_id, received_at,
    source_identity, classification, sender_summary, subject, summary,
    gmail_link, needs_action, action_title, action_due_at, confidence,
    processing_status, evidence_id
  ) values (
    target_user_id, target_provider_message_id, target_provider_thread_id,
    target_history_id, target_received_at, target_source_identity,
    target_classification, target_sender_summary, target_subject, target_summary,
    target_gmail_link, target_needs_action, target_action_title,
    target_action_due_at, target_confidence,
    case when target_inbox_classification = 'pending' then 'pending' else 'processed' end,
    evidence_id
  ) returning id into message_id;

  insert into public.inbox_items (
    user_id, gmail_message_id, item_type, classification, title, summary,
    confidence, target_type, target_id, evidence_id
  ) values (
    target_user_id, message_id, target_item_type, target_inbox_classification,
    target_inbox_title, target_inbox_summary, target_confidence,
    target_target_type, target_target_id, evidence_id
  ) returning id into item_id;

  for attachment in select value from jsonb_array_elements(target_attachments)
  loop
    insert into public.gmail_attachments (
      user_id, gmail_message_id, provider_attachment_id, filename,
      mime_type, size_bytes, import_status
    ) values (
      target_user_id, message_id, attachment->>'providerAttachmentId',
      attachment->>'filename', attachment->>'mimeType',
      (attachment->>'size')::bigint, 'link_only'
    );
  end loop;

  return query select message_id, item_id, true;
end;
$$;

revoke execute on function public.store_gmail_projection(
  uuid, text, text, text, timestamptz, text, text, text, text, text, text,
  boolean, text, timestamptz, numeric, text, text, text, text, text, text, text,
  uuid, jsonb
) from public, anon, authenticated;
grant execute on function public.store_gmail_projection(
  uuid, text, text, text, timestamptz, text, text, text, text, text, text,
  boolean, text, timestamptz, numeric, text, text, text, text, text, text, text,
  uuid, jsonb
) to service_role;
