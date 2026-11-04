-- M6 real-sync fix: qualify the inbox foreign key because the function's
-- TABLE return column has the same PL/pgSQL identifier.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.store_gmail_projection(uuid,text,text,text,timestamptz,text,text,text,text,text,text,boolean,text,timestamptz,numeric,text,text,text,text,text,text,text,uuid,jsonb)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'select id into item_id from public.inbox_items where gmail_message_id = message_id;',
    'select inbox.id into item_id from public.inbox_items inbox where inbox.gmail_message_id = message_id;'
  );
  execute definition;
end;
$migration$;
