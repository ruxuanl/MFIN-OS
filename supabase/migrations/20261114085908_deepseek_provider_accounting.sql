-- D35: label provider reservations/results accurately without changing budget or permission gates.
alter table public.ai_usage_events drop constraint ai_usage_events_provider_check;
alter table public.ai_usage_events add constraint ai_usage_events_provider_check
  check (provider in ('openai', 'deepseek'));
alter table public.ai_analyses drop constraint ai_analyses_provider_check;
alter table public.ai_analyses add constraint ai_analyses_provider_check
  check (provider in ('openai', 'deepseek'));

create function private.set_ai_provider_from_model()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.model is not null then
    new.provider := case when new.model like 'deepseek-%' then 'deepseek' else 'openai' end;
  end if;
  return new;
end;
$$;
revoke all on function private.set_ai_provider_from_model() from public, anon, authenticated;

create trigger ai_usage_provider_from_model
before insert or update of model, provider on public.ai_usage_events
for each row execute function private.set_ai_provider_from_model();
create trigger ai_analysis_provider_from_model
before insert or update of model, provider on public.ai_analyses
for each row execute function private.set_ai_provider_from_model();

-- Correct only rows whose persisted model proves the actual provider; preserve audit history/results/costs.
update public.ai_usage_events set provider = 'deepseek'
where model like 'deepseek-%' and provider <> 'deepseek';
update public.ai_analyses set provider = 'deepseek'
where model like 'deepseek-%' and provider <> 'deepseek';

create function private.reserve_ai_usage_for_provider(
  target_analysis_kind text,
  target_input_fingerprint text,
  target_reserve_hkd_cents integer,
  target_provider text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  usage_id uuid;
begin
  if target_provider is null or target_provider not in ('openai', 'deepseek') then
    raise exception 'invalid_ai_provider' using errcode = '22023';
  end if;
  -- The existing function retains auth.uid(), privacy lock, capability checks,
  -- the shared monthly advisory lock and the HK$100 cross-provider limit.
  usage_id := private.reserve_ai_usage(target_analysis_kind, target_input_fingerprint, target_reserve_hkd_cents);
  update public.ai_usage_events set provider = target_provider
  where id = usage_id and user_id = auth.uid();
  return usage_id;
end;
$$;

create function public.reserve_my_ai_usage_for_provider(
  target_analysis_kind text,
  target_input_fingerprint text,
  target_reserve_hkd_cents integer,
  target_provider text
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.reserve_ai_usage_for_provider(
    target_analysis_kind, target_input_fingerprint, target_reserve_hkd_cents, target_provider
  );
$$;
revoke all on function private.reserve_ai_usage_for_provider(text, text, integer, text) from public, anon;
revoke all on function public.reserve_my_ai_usage_for_provider(text, text, integer, text) from public, anon;
grant execute on function private.reserve_ai_usage_for_provider(text, text, integer, text) to authenticated, service_role;
grant execute on function public.reserve_my_ai_usage_for_provider(text, text, integer, text) to authenticated, service_role;
