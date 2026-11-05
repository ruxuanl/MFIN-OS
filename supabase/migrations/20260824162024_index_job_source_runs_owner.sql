-- Supports owner-scoped RLS and the status-center recent-run query.
create index if not exists job_source_runs_user_started_idx
  on public.job_source_runs (user_id, started_at desc);
