import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readMigrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql") && name.includes("m6_")).sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M5 client boundaries are ordered before the M6 Gmail migrations", async () => {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  const gmailStart = names.findIndex((name) => name.includes("m6_gmail_inbox"));
  assert.ok(gmailStart > names.findIndex((name) => name.includes("m5_client_write_boundary")));
  assert.ok(gmailStart > names.findIndex((name) => name.includes("m5_notification_update_boundary")));
});

test("M6 stores minimal Gmail projections and unified inbox data behind read-only RLS", async () => {
  const sql = await readMigrations();
  for (const table of ["gmail_messages", "inbox_items", "gmail_attachments", "gmail_updates"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /grant select on public\.gmail_messages, public\.inbox_items,[\s\S]+to authenticated/i);
  assert.doesNotMatch(sql, /grant (insert|delete|all)[^;]*public\.gmail_messages[^;]*to authenticated/i);
  assert.doesNotMatch(sql, /body text|raw_message|full_body|oauth_token|refresh_token/i);
});
test("M6 enforces one read-only Gmail scope and Vault-only credential storage", async () => {
  const sql = await readMigrations();
  assert.match(sql, /readonly_scope constant text := 'https:\/\/www\.googleapis\.com\/auth\/gmail\.readonly'/i);
  assert.match(sql, /if target_scopes <> array\[readonly_scope\]::text\[\]/i);
  assert.match(sql, /vault\.create_secret/i);
  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /revoke execute on function public\.read_gmail_oauth_credentials[\s\S]+from public, anon, authenticated/i);
  for (const forbidden of ["gmail.send", "gmail.modify", "gmail.compose", "gmail.labels", "mail.google.com/"]) {
    assert.doesNotMatch(sql, new RegExp(`googleapis\\.com/auth/${forbidden.replace(".", "\\.")}`, "i"));
  }
});

test("M6 keeps uncertain mail pending and high-confidence interview changes atomic and undoable", async () => {
  const sql = await readMigrations();
  assert.match(sql, /mail_rules_v1/i);
  assert.match(sql, /gmail_interview_not_high_confidence/i);
  assert.match(sql, /message_record\.confidence < 0\.98/i);
  assert.match(sql, /private\.evaluate_permission\(target_user_id, 'gmail\.rules_status_update', null\)/i);
  assert.match(sql, /main_stage = 'interview'/i);
  assert.match(sql, /calendar\.write_fact/i);
  assert.match(sql, /notification_type[\s\S]+interview_invitation/i);
  assert.match(sql, /insert into public\.undo_operations/i);
  assert.match(sql, /create or replace function public\.undo_my_gmail_update/i);
});

test("M6 keeps incremental cursors private and bounded full sync explicit", async () => {
  const sql = await readMigrations();
  assert.match(sql, /create table private\.gmail_sync_cursors/i);
  assert.match(sql, /initial_query text not null default 'in:inbox newer_than:30d'/i);
  assert.match(sql, /revoke execute on function public\.get_gmail_sync_cursor[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.get_gmail_sync_cursor[\s\S]+to service_role/i);
});

test("M6 private attachment bucket has no browser write policy and supports immediate copy deletion", async () => {
  const sql = await readMigrations();
  assert.match(sql, /insert into storage\.buckets[\s\S]+'gmail-attachments'[\s\S]+false[\s\S]+10485760/i);
  assert.match(sql, /create policy gmail_attachments_storage_read_own[\s\S]+for select to authenticated/i);
  assert.doesNotMatch(sql, /for (insert|update|delete) to authenticated[\s\S]+gmail-attachments/i);
  assert.match(sql, /import_status in \('link_only', 'pending', 'imported', 'deleted', 'failed'\)/i);
});

test("M6 grants the complete atomic projection function signature", async () => {
  const sql = await readFile(
    path.join(process.cwd(), "supabase", "migrations", "20260812173438_m6_gmail_atomic_projection.sql"),
    "utf8"
  );
  const completeSignatures = sql.match(
    /numeric,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*text,\s*uuid,\s*jsonb/giu
  );
  assert.equal(completeSignatures?.length, 2);
});

test("M6 ambiguity fix accepts compact and whitespace-preserving function definitions", async () => {
  const sql = await readFile(
    path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20260812233353_m6_gmail_projection_ambiguity_fix_v2.sql"
    ),
    "utf8"
  );
  assert.match(sql, /where inbox\.gmail_message_id=message_id;/u);
  assert.match(sql, /where inbox\.gmail_message_id = message_id;/u);
});
