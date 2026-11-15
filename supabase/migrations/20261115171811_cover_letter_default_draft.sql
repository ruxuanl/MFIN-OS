-- Preserve two independent letters; AI continues to write only cover_letter.
alter table public.application_drafts drop constraint application_drafts_field_key_check;
alter table public.application_drafts add constraint application_drafts_field_key_check
 check (field_key ~ '^(cover_letter_base|cover_letter|tailoring_points|gap_explanation|qa_[1-5])$');
do $$
declare definition text;
begin
 select pg_get_functiondef('private.save_draft_impl(uuid,text,text,text,bigint)'::regprocedure) into definition;
 definition:=replace(definition,'^(cover_letter|tailoring_points|gap_explanation|qa_[1-5])$','^(cover_letter_base|cover_letter|tailoring_points|gap_explanation|qa_[1-5])$');
 execute definition;
 select pg_get_functiondef('private.apply_application_pack_impl(uuid)'::regprocedure) into definition;
 definition:=replace(definition,'  for field in','  if not exists(select 1 from private.evaluate_permission(actor_user_id,''ai.material_draft'',null) where allowed) then raise exception ''ai_permission_denied'' using errcode=''42501''; end if;'||chr(10)||'  for field in');
 execute definition;
end $$;
