-- A browser session can request metadata registration, but only the trusted
-- Web service can upload to this bucket. Reject metadata for missing objects.

create function private.guard_resume_version_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'resume-files' and name = new.storage_path
  ) then
    raise exception 'resume_file_not_uploaded' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger resume_versions_storage_guard
before insert on public.resume_versions
for each row execute function private.guard_resume_version_storage();

revoke execute on function private.guard_resume_version_storage() from public, anon, authenticated;
grant execute on function private.guard_resume_version_storage() to service_role;
