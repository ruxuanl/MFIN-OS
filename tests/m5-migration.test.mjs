import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readMigrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql") && name.includes("m5_"))
    .sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M5 persists schedules, immutable report versions, items, and notifications behind RLS", async () => {
  const sql = await readMigrations();
  for (const table of ["report_schedules", "reports", "report_items", "notifications"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /unique \(user_id, report_type, report_date, version\)/i);
  assert.match(sql, /generation_strategy text not null default 'rules_v1'/i);
  assert.match(sql, /grant select on public\.reports, public\.report_items to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*public\.reports[^;]*to authenticated/i);
});

test("M5 schedules the three product reports and records source health and cutoffs", async () => {
  const sql = await readMigrations();
  assert.match(sql, /\(auth\.uid\(\), 'morning', time '08:00', null\)/i);
  assert.match(sql, /\(auth\.uid\(\), 'evening', time '22:30', null\)/i);
  assert.match(sql, /\(auth\.uid\(\), 'weekly', time '20:00', 7\)/i);
  assert.match(sql, /data_cutoff_at timestamptz not null/i);
  assert.match(sql, /source_health jsonb not null/i);
  assert.match(sql, /unavailableSources[\s\S]+gmail[\s\S]+wechat[\s\S]+job_radar_ai/i);
  assert.match(sql, /cron\.schedule[\s\S]+'m5-generate-due-reports'/i);
});

test("M5 respects report permission, privacy lock, idempotency, and scheduler safety", async () => {
  const sql = await readMigrations();
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'reports\.generate', null\)/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /concat\('report:', schedule_row\.report_type, ':', report_day\)/i);
  assert.match(sql, /on conflict \(user_id, idempotency_key\) do nothing/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /safe_checkpoint[\s\S]+'permission_checked'/i);
  assert.match(sql, /status = 'failed'[\s\S]+last_error_code = sqlstate/i);
});

test("M5 keeps recommendations honest and daily push types allow-listed", async () => {
  const sql = await readMigrations();
  assert.match(sql, /limit 3/i);
  assert.match(sql, /qualification_score[\s\S]+match_score[\s\S]+limit 5/i);
  assert.match(sql, /系统不会自动滚动到明天/i);
  assert.match(sql, /generation_strategy in \('rules_v1', 'ai'\)/i);
  for (const type of [
    "interview_invitation",
    "deadline_24h",
    "schedule_conflict",
    "high_match_expiring",
    "connection_failure"
  ]) assert.match(sql, new RegExp(type));
  assert.match(sql, /target_notification_type not in \('interview_invitation', 'deadline_24h', 'schedule_conflict', 'high_match_expiring', 'connection_failure'\)/i);
  assert.match(sql, /unique \(user_id, dedupe_key\)/i);
});

test("M5 evening closeout requires an explicit user outcome and audits it", async () => {
  const sql = await readMigrations();
  assert.match(sql, /close_out_my_action/i);
  assert.match(sql, /target_outcome not in \('completed', 'continue', 'waiting', 'cancelled', 'downgraded', 'rescheduled'\)/i);
  assert.match(sql, /target_outcome = 'rescheduled' and target_reschedule_at is null/i);
  assert.match(sql, /action\.evening_closeout/i);
  assert.match(sql, /source', 'user_confirmation'/i);
});

test("M5 report generation uses a public invoker wrapper over the private guarded implementation", async () => {
  const sql = await readMigrations();
  assert.match(sql, /alter function public\.generate_my_report\(text\) set schema private/i);
  assert.match(sql, /create function public\.generate_my_report[\s\S]+security invoker[\s\S]+private\.generate_my_report/i);
  assert.match(sql, /revoke execute on function private\.generate_report\(uuid, text, text, uuid\)[\s\S]+from authenticated/i);
});

test("M5 keeps scheduler and delivery state behind narrow client-write RPCs", async () => {
  const sql = await readMigrations();
  assert.match(sql, /revoke insert, update, delete on public\.report_schedules from authenticated/i);
  assert.match(sql, /create function public\.update_my_report_schedule[\s\S]+security invoker[\s\S]+private\.update_my_report_schedule/i);
  assert.match(sql, /update public\.report_schedules[\s\S]+set enabled = target_enabled,[\s\S]+local_time = target_local_time/i);
  assert.match(sql, /alter function public\.enqueue_my_smart_notification[\s\S]+set schema private/i);
  assert.match(sql, /create function public\.enqueue_my_smart_notification[\s\S]+security invoker[\s\S]+private\.enqueue_my_smart_notification/i);
  assert.match(sql, /revoke update \(status, read_at\) on public\.notifications from authenticated/i);
  assert.match(sql, /revoke update on public\.notifications from anon, authenticated/i);
  assert.match(sql, /grant update \(read_at\) on public\.notifications to authenticated/i);
});
