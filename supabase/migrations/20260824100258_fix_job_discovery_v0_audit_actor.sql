-- The Test project compiled the V0 migration before the integration test
-- reached its terminal audit insert. Existing audit_events accept scheduler,
-- not automation, as the background-run actor. Fresh installs already contain
-- the corrected body; this repair is therefore intentionally idempotent.

do $migration$
declare
  function_definition text;
  old_fragment text := 'run_record.user_id, ''automation'', ''job_source.run_finished''';
  new_fragment text := 'run_record.user_id, ''scheduler'', ''job_source.run_finished''';
begin
  select pg_get_functiondef(
    'private.finish_job_source_run(uuid,text,integer,integer,integer,text,text)'::regprocedure
  ) into function_definition;

  if position(old_fragment in function_definition) > 0 then
    execute replace(function_definition, old_fragment, new_fragment);
  elsif position(new_fragment in function_definition) = 0 then
    raise exception 'unexpected_job_source_audit_actor_definition';
  end if;
end;
$migration$;
