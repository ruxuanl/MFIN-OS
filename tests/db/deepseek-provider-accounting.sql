-- Run only on the owner's isolated single-user Test. All ledger writes roll back.
begin;
do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'test_requires_single_user_instance';
  end if;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', (select id from auth.users limit 1), 'role', 'authenticated'
  )::text, true);
end;
$$;
set local role authenticated;
do $$
declare
  usage_id uuid;
  saved_claims text := current_setting('request.jwt.claims');
begin
  if has_function_privilege('anon', 'public.reserve_my_ai_usage_for_provider(text,text,integer,text)', 'EXECUTE') then
    raise exception 'anonymous_rpc_grant';
  end if;
  usage_id := public.reserve_my_ai_usage_for_provider('resume', repeat('d',64), 200, 'deepseek');
  if not exists (select 1 from public.ai_usage_events where id=usage_id and provider='deepseek' and status='reserved') then
    raise exception 'provider_reservation_not_persisted';
  end if;
  begin
    perform public.reserve_my_ai_usage_for_provider('resume', repeat('e',64), 200, 'unknown');
    raise exception 'invalid_provider_was_accepted';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.reserve_my_ai_usage_for_provider('resume', repeat('f',64), 10000, 'openai');
    raise exception 'cross_provider_budget_not_enforced';
  exception when raise_exception then
    if sqlerrm <> 'ai_monthly_budget_exceeded' then raise; end if;
  end;
  perform set_config('request.jwt.claims', '{}', true);
  begin
    perform public.reserve_my_ai_usage_for_provider('resume', repeat('e',64), 200, 'deepseek');
    raise exception 'unauthenticated_reservation_was_accepted';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', saved_claims, true);
end;
$$;
rollback;
