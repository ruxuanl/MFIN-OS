-- Keep SELECT and mutation policies disjoint so Postgres evaluates only the
-- policy needed for the current command. This removes the permissive-policy
-- overlap reported by the Supabase performance advisor.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'opportunity_candidates',
    'opportunities',
    'courses',
    'actions',
    'action_dependencies',
    'timeline_entries',
    'custom_field_definitions',
    'custom_field_values',
    'saved_views',
    'client_mutations',
    'sync_conflicts'
  ]
  loop
    execute format('drop policy %I on public.%I', table_name || '_write_own', table_name);

    execute format(
      'create policy %I on public.%I for insert to authenticated with check (private.m3_writes_allowed(user_id))',
      table_name || '_insert_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (private.m3_writes_allowed(user_id)) with check (private.m3_writes_allowed(user_id))',
      table_name || '_update_own',
      table_name
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (private.m3_writes_allowed(user_id))',
      table_name || '_delete_own',
      table_name
    );
  end loop;
end;
$$;

create index action_dependencies_user_id_idx
  on public.action_dependencies (user_id);

create index opportunities_candidate_id_idx
  on public.opportunities (candidate_id)
  where candidate_id is not null;

create index opportunity_candidates_promoted_opportunity_id_idx
  on public.opportunity_candidates (promoted_opportunity_id)
  where promoted_opportunity_id is not null;
