-- Apply the qualification to the compact definition produced by the remote
-- migration runner, and fail closed if the expected statement is absent.
do $migration$
declare
  definition text;
  fixed_definition text;
begin
  select pg_get_functiondef(
    'public.store_gmail_projection(uuid,text,text,text,timestamptz,text,text,text,text,text,text,boolean,text,timestamptz,numeric,text,text,text,text,text,text,text,uuid,jsonb)'::regprocedure
  ) into definition;
  fixed_definition := replace(
    definition,
    'select id into item_id from public.inbox_items where gmail_message_id=message_id;',
    'select inbox.id into item_id from public.inbox_items inbox where inbox.gmail_message_id=message_id;'
  );
  if fixed_definition = definition and (
    position('where inbox.gmail_message_id=message_id;' in definition) > 0
    or position('where inbox.gmail_message_id = message_id;' in definition) > 0
  ) then
    return;
  end if;
  if fixed_definition = definition then
    raise exception 'gmail_projection_ambiguity_fix_not_applied';
  end if;
  execute fixed_definition;
end;
$migration$;
