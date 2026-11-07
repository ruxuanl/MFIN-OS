import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readMigrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql") && name.includes("m4_"))
    .sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M4 creates calendar state with RLS and private incremental cursors", async () => {
  const sql = await readMigrations();
  for (const table of [
    "calendar_sources",
    "calendar_events",
    "calendar_event_links",
    "calendar_sync_operations",
    "calendar_sync_conflicts"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /create table private\.calendar_sync_cursors/i);
  assert.doesNotMatch(sql, /create table public\.calendar_sync_cursors/i);
});

test("Calendar credentials stay in Vault and service-only RPCs are not user executable", async () => {
  const sql = await readMigrations();
  assert.match(sql, /vault\.create_secret/i);
  assert.match(sql, /vault\.decrypted_secrets/i);
  assert.match(sql, /credential_storage/i);
  assert.match(sql, /credential_deleted/i);
  assert.doesNotMatch(sql, /jsonb_build_object\('secret_storage'/i);
  assert.doesNotMatch(sql, /jsonb_build_object\('secret_deleted'/i);
  for (const signature of [
    "store_calendar_oauth_credentials\\(uuid, text, text\\[\\], timestamptz\\)",
    "read_calendar_oauth_credentials\\(uuid\\)",
    "delete_calendar_oauth_credentials\\(uuid\\)",
    "get_calendar_sync_cursor\\(uuid\\)",
    "set_calendar_sync_cursor\\(uuid, uuid, text, text\\)",
    "clear_calendar_sync_cursor\\(uuid\\)"
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${signature} from public, anon, authenticated`, "i"));
  }
  assert.doesNotMatch(sql, /grant execute on function public\.(store|read|delete)_calendar_oauth_credentials[^;]+to authenticated/i);
});

test("authenticated calendar writes use public invoker wrappers over private definer implementations", async () => {
  const sql = await readMigrations();
  for (const signature of [
    "queue_action_calendar_sync\\(uuid, boolean\\)",
    "set_my_calendar_connection_status\\(text\\)",
    "resolve_calendar_sync_conflict\\(uuid, text\\)"
  ]) {
    assert.match(sql, new RegExp(`alter function public\\.${signature} set schema private`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to authenticated, service_role`, "i"));
  }
  assert.match(sql, /create function public\.queue_action_calendar_sync[\s\S]+security invoker[\s\S]+private\.queue_action_calendar_sync/i);
  assert.match(sql, /grant usage on schema private to authenticated, service_role/i);
  assert.match(sql, /grant select on[\s\S]+calendar_sync_conflicts[\s\S]+to authenticated/i);
  const authenticatedCalendarGrants = sql.split(";").filter((statement) =>
    /grant\s+.+\s+on/i.test(statement) && /calendar_(sources|events|event_links|sync_operations|sync_conflicts)/i.test(statement) && /to authenticated/i.test(statement)
  );
  assert.ok(authenticatedCalendarGrants.length > 0);
  for (const statement of authenticatedCalendarGrants) {
    assert.doesNotMatch(statement, /grant\s+(insert|update|delete|all)\s+on/i);
  }
});

test("authenticated permission decisions can cross the private evaluator boundary", async () => {
  const sql = await readMigrations();
  assert.match(
    sql,
    /alter function public\.get_my_permission_decision\(text, uuid\) security definer/i
  );
});

test("M4 handles idempotency, pause recovery, privacy lock, and explicit conflicts", async () => {
  const sql = await readMigrations();
  assert.match(sql, /calendar_sync_operations_one_active_idx[\s\S]+status in \('pending', 'processing'\)/i);
  assert.match(sql, /supersede_calendar_sync_operation/i);
  assert.match(sql, /new\.idempotency_key := active_operation\.idempotency_key/i);
  assert.match(sql, /last_error_code = 'superseded'/i);
  assert.match(sql, /clear_resumed_calendar_operation_blocks/i);
  assert.match(sql, /blocked_reason in \('connection_paused', 'connection_unavailable'\)/i);
  assert.match(sql, /private\.m4_writes_allowed\(auth\.uid\(\)\)/i);
  assert.match(sql, /conflict_type text not null check \(conflict_type in \('remote_deleted', 'concurrent_change', 'write_protected'\)\)/i);
  assert.match(sql, /resolve_calendar_sync_conflict/i);
  assert.match(sql, /align_use_product_conflict_resolution/i);
  assert.match(sql, /provider_etag = event\.etag/i);
});

test("M4 persists provider-observed product ownership before allowing updates", async () => {
  const sql = await readMigrations();
  assert.match(sql, /add column product_owned boolean not null default false/i);
  assert.match(sql, /add column product_action_id uuid references public\.actions\(id\)/i);
  assert.match(sql, /calendar_event_product_marker_shape/i);
});
