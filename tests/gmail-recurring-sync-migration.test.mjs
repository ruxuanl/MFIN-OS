import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/20260824172143_gmail_recurring_sync.sql",
  import.meta.url
);
const sql = await readFile(migrationUrl, "utf8");

test("Gmail recurring sync uses a private Vault-backed HTTPS dispatcher", () => {
  assert.match(sql, /create extension if not exists pg_net with schema extensions/i);
  assert.match(sql, /create or replace function private\.invoke_gmail_sync_cron\(\)/i);
  assert.match(sql, /gmail_sync_app_origin/i);
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'gmail\.sync', null\)/i);
  assert.match(sql, /insert into public\.automation_runs/i);
  assert.match(sql, /on conflict \(user_id, idempotency_key\) do nothing/i);
  assert.match(sql, /net\.http_post/i);
  assert.match(sql, /\/api\/internal\/gmail-sync/i);
  assert.match(sql, /jsonb_build_object\('runId', automation_run_id\)/i);
});

test("Gmail cron is frequent, no-op when unconfigured, and browser-inaccessible", () => {
  assert.match(sql, /'\*\/15 \* \* \* \*'/i);
  assert.match(sql, /return null/i);
  assert.match(sql, /revoke all on function private\.invoke_gmail_sync_cron\(\) from public, anon, authenticated/i);
  assert.doesNotMatch(sql, /gmail\.send|gmail\.modify|messages\.send/i);
});
