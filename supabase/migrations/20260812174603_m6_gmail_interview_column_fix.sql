-- Follow-up for already-migrated test databases: restore the gmail_updates
-- column list after renaming only the local PL/pgSQL variable.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.apply_gmail_interview_update(uuid,uuid,uuid)'::regprocedure
  ) into definition;
  definition := replace(
    definition,
    'previous_main_stage, previous_substage, created_action_id,',
    'previous_main_stage, previous_substage, action_id,'
  );
  execute definition;
end;
$migration$;
