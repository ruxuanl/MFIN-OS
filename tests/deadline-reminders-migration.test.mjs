import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112150000_deadline_reminders_rules_v2.sql", import.meta.url), "utf8");
const home = await readFile(new URL("../apps/web/src/app/(app)/page.tsx", import.meta.url), "utf8");

test("deadline tiers are 7 / 3 / 1 days plus the day itself, in the daily report only", () => {
  assert.equal((migration.match(/in \(0, 1, 3, 7\)/g) ?? []).length, 2);
  assert.match(migration, /'deadline', position_counter/);
  assert.match(migration, /'schedule', 'must_do', 'deadline', 'focus'/);
});

test("instant push only inside 24 hours, permission-gated and de-duplicated", () => {
  assert.match(migration, /due\.deadline_at > now\(\) and due\.deadline_at <= now\(\) \+ interval '24 hours'/);
  assert.match(migration, /evaluate_permission\(target_user_id, 'notifications\.smart_push', null\)/);
  assert.match(migration, /'deadline_24h:' \|\| due\.kind \|\| ':' \|\| due\.id::text \|\| ':' \|\| due\.deadline::text/);
  assert.match(migration, /on conflict \(user_id, dedupe_key\) do nothing/);
  assert.doesNotMatch(migration, /notification_type in \(/, "no new notification types beyond the allowlist");
  assert.doesNotMatch(migration, /net\.http_/);
});

test("reports are labelled rules_v2 (non-AI) with a data cutoff", () => {
  assert.match(migration, /report_summary, 'rules_v2', now\(\)/);
  assert.match(migration, /rules_v2 规则生成（非 AI），数据截止/);
  assert.match(migration, /'strategy', 'rules_v2'/);
  assert.match(home, /strategyLabel\(morning\?\.generation_strategy\)/);
});

test("top three merges actions and unfinished packages without double counting", () => {
  assert.match(migration, /p\.deadline_action_id = a\.id and p\.status in \('draft', 'ready'\)/);
  assert.match(migration, /limit 3/);
  assert.match(migration, /系统不代为提交/);
});

test("new private functions are not callable by browsers", () => {
  assert.match(migration, /revoke all on function private\.enqueue_deadline_notifications\(uuid\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function private\.enqueue_due_deadline_notifications\(\) from public, anon, authenticated;/);
});
