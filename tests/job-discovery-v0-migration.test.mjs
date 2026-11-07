import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824095136_job_discovery_v0_source_control.sql",
  import.meta.url
);
const sql = await readFile(migrationUrl, "utf8");
const goldmanMigrationUrl = new URL(
  "../supabase/migrations/20260826061655_goldman_sachs_job_source.sql",
  import.meta.url
);
const goldmanSql = await readFile(goldmanMigrationUrl, "utf8");

test("job discovery V0 stores only user-approved public source control and health", () => {
  assert.match(sql, /create table public\.job_sources/i);
  assert.match(sql, /access_mode text not null default 'public_web'/i);
  assert.match(sql, /base_url ~ '\^https:\/\//i);
  assert.match(sql, /polling_interval_minutes between 60 and 10080/i);
  assert.match(sql, /approval_status in \('pending', 'approved', 'rejected'\)/i);
  assert.match(sql, /not enabled or approval_status = 'approved'/i);
  assert.match(sql, /coverage_gap text/i);
});

test("job discovery runs are permission-gated, idempotent, and fail coverage honestly", () => {
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'job_radar\.discovery', null\)/i);
  assert.match(sql, /unique \(source_id, run_key\)/i);
  assert.match(sql, /job_source_not_due/i);
  assert.match(sql, /permission_stopped_before_commit/i);
  assert.match(sql, /partial_run_requires_gap/i);
  assert.match(sql, /failed_run_requires_error_and_gap/i);
});

test("job discovery browser access is owner-only read with service-only writes", () => {
  assert.match(sql, /alter table public\.job_sources enable row level security/i);
  assert.match(sql, /create policy job_sources_read_own[\s\S]+auth\.uid\(\)\) = user_id/i);
  assert.match(sql, /revoke all on public\.job_sources, public\.job_source_runs from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.job_sources, public\.job_source_runs to authenticated/i);
  assert.match(sql, /job_source_runs_user_started_idx[\s\S]+\(user_id, started_at desc\)/i);
  assert.match(sql, /revoke execute on function public\.start_job_source_run[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.start_job_source_run[\s\S]+to service_role/i);
  assert.doesNotMatch(sql, /send_(email|message)|submit_application|contact_person/i);
});

test("Goldman Sachs ingestion is service-only, atomic, and candidate-pool-only", () => {
  assert.match(goldmanSql, /create table private\.job_source_items/i);
  assert.match(goldmanSql, /create function private\.complete_goldman_sachs_job_source_run/i);
  assert.match(goldmanSql, /private\.evaluate_permission\(run_record\.user_id, 'job_radar\.discovery', null\)/i);
  assert.match(goldmanSql, /insert into public\.opportunity_candidates/i);
  assert.doesNotMatch(goldmanSql, /insert into public\.opportunities/i);
  assert.match(goldmanSql, /grant execute on function public\.complete_goldman_sachs_job_source_run[\s\S]+to service_role/i);
  assert.match(goldmanSql, /revoke execute on function public\.complete_goldman_sachs_job_source_run[\s\S]+from public, anon, authenticated/i);
});

test("Goldman Sachs scheduler runs every six hours and remains a no-op when unconfigured", () => {
  assert.match(goldmanSql, /job-discovery-goldman-sachs-6h/i);
  assert.match(goldmanSql, /'23 \*\/6 \* \* \*'/i);
  assert.match(goldmanSql, /job_discovery_app_origin/i);
  assert.match(goldmanSql, /if app_origin is null[\s\S]+return null/i);
  assert.match(goldmanSql, /source_key = 'goldman-sachs\.apac-early-careers'/i);
  assert.doesNotMatch(goldmanSql, /higher\.gs\.com/i);
});
