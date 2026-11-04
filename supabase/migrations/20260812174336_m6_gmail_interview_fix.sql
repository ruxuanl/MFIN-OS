-- M6 hotfix: avoid ambiguity between the inbox action_id column and the
-- PL/pgSQL local variable in the atomic high-confidence update function.
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.apply_gmail_interview_update(uuid,uuid,uuid)'::regprocedure
  ) into definition;
  definition := replace(definition, E'\n  action_id uuid;', E'\n  created_action_id uuid;');
  definition := replace(definition, 'returning id into action_id;', 'returning id into created_action_id;');
  definition := replace(definition, E'''action_id'', action_id,', E'''action_id'', created_action_id,');
  definition := replace(definition, 'target_user_id, action_id,', 'target_user_id, created_action_id,');
  definition := replace(definition, 'substage, action_id,', 'substage, created_action_id,');
  definition := replace(definition, 'previous_substage, created_action_id,', 'previous_substage, action_id,');
  definition := replace(definition, 'action_id = action_id', 'action_id = created_action_id');
  execute definition;
end;
$migration$;
