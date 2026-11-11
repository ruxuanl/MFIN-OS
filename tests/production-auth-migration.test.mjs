import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260820042301_production_single_user_auth_hook.sql"
);

const productionWrapperGrantMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260821030112_restore_pre_m7_private_wrapper_grants.sql"
);

const workspaceWriteGuardGrantMigrationPath = path.join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260821170519_restore_m3_workspace_write_guard.sql"
);

async function readMigration() {
  return readFile(migrationPath, "utf8");
}

test("Production Auth hook keeps the allowlist private and digest-only", async () => {
  const sql = await readMigration();
  assert.match(sql, /create table private\.auth_signup_allowlist/iu);
  assert.match(sql, /email_hash bytea not null unique/iu);
  assert.match(sql, /octet_length\(email_hash\) = 32/iu);
  assert.match(sql, /alter table private\.auth_signup_allowlist enable row level security/iu);
  assert.match(sql, /pg_catalog\.sha256[\s\S]+pg_catalog\.convert_to/iu);
  assert.doesNotMatch(sql, /grant usage on schema extensions/iu);
  assert.doesNotMatch(sql, /example-sensitive-user|@gmail\.com/iu);
});

test("Production Auth compatibility fix avoids extensions schema access", async () => {
  const sql = await readFile(
    path.join(process.cwd(), "supabase", "migrations", "20260820045413_auth_hook_builtin_sha256.sql"),
    "utf8"
  );
  assert.match(sql, /create or replace function public\.before_user_created_single_user\(event jsonb\)/iu);
  assert.match(sql, /pg_catalog\.sha256/iu);
  assert.doesNotMatch(sql, /extensions\.|grant usage on schema extensions/iu);
  assert.match(sql, /security invoker/iu);
});

test("Production Auth hook allows only the first matching user", async () => {
  const sql = await readMigration();
  assert.match(sql, /if exists \(select 1 from auth\.users\)/iu);
  assert.match(sql, /where allowlist\.singleton[\s\S]+allowlist\.email_hash = candidate_hash/iu);
  assert.match(sql, /return '\{\}'::jsonb/iu);
  assert.match(sql, /'http_code', 403/iu);
  assert.match(sql, /security invoker/iu);
  assert.doesNotMatch(sql, /security definer/iu);
});

test("Production Auth hook is executable only by Supabase Auth", async () => {
  const sql = await readMigration();
  assert.match(
    sql,
    /revoke all on function public\.before_user_created_single_user\(jsonb\)[\s\S]+from public, anon, authenticated, service_role/iu
  );
  assert.match(
    sql,
    /grant execute on function public\.before_user_created_single_user\(jsonb\)[\s\S]+to supabase_auth_admin/iu
  );
  assert.match(sql, /grant select on table private\.auth_signup_allowlist to supabase_auth_admin/iu);
});

test("Production restores only reviewed authenticated wrapper implementations after M7", async () => {
  const sql = await readFile(productionWrapperGrantMigrationPath, "utf8");
  const signatures = [
    "set_my_calendar_connection_status\\(text\\)",
    "queue_action_calendar_sync\\(uuid, boolean\\)",
    "resolve_calendar_sync_conflict\\(uuid, text\\)",
    "ensure_my_report_schedules\\(\\)",
    "update_my_report_schedule\\(text, boolean, time\\)",
    "generate_my_report\\(text\\)",
    "enqueue_my_smart_notification\\(text, text, text, text, text, text\\)"
  ];

  for (const signature of signatures) {
    assert.match(
      sql,
      new RegExp(`revoke all on function private\\.${signature} from public, anon`, "iu")
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function private\\.${signature} to authenticated, service_role`,
        "iu"
      )
    );
  }
  assert.doesNotMatch(sql, /grant (?:usage|select|insert|update|delete|all) on (?:schema|table)/iu);
});

test("Production restores the owner-scoped M3 write predicate after M7", async () => {
  const sql = await readFile(workspaceWriteGuardGrantMigrationPath, "utf8");
  assert.match(sql, /grant usage on schema private to authenticated, service_role/iu);
  assert.match(
    sql,
    /revoke execute on function private\.m3_writes_allowed\(uuid\) from public, anon/iu
  );
  assert.match(
    sql,
    /grant execute on function private\.m3_writes_allowed\(uuid\) to authenticated, service_role/iu
  );
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all) on table/iu);
});
