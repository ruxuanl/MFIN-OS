import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readMigrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M3 creates each independent workspace and enables RLS", async () => {
  const sql = await readMigrations();
  for (const table of [
    "opportunity_candidates",
    "opportunities",
    "courses",
    "actions",
    "timeline_entries",
    "custom_field_definitions",
    "custom_field_values",
    "saved_views",
    "client_mutations",
    "sync_conflicts"
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("candidate promotion is explicit and cannot silently cross tracks", async () => {
  const sql = await readMigrations();
  assert.match(sql, /promote_opportunity_candidate[\s\S]+target_intent not in \('track', 'apply'\)/i);
  assert.match(sql, /candidate\.track, target_intent/i);
  assert.match(sql, /track text not null check \(track in \('internship', 'graduate'\)\)/i);

  const mutationFunction = sql.match(/create or replace function public\.apply_workspace_mutation[\s\S]+?create or replace function public\.resolve_sync_conflict/i)?.[0] ?? "";
  assert.doesNotMatch(mutationFunction, /allowed_fields := array\[[^\]]*'track'/i);
  assert.match(sql, /candidate_track_is_immutable/i);
  assert.match(sql, /opportunity_identity_is_immutable/i);
  assert.match(sql, /action_context_is_immutable/i);
  assert.match(sql, /old_payload jsonb := to_jsonb\(old\)/i);
});

test("offline mutations merge different fields and surface same-field conflicts", async () => {
  const sql = await readMigrations();
  assert.match(sql, /current_data -> patch_key is distinct from target_base_values -> patch_key/i);
  assert.match(sql, /insert into public\.sync_conflicts/i);
  assert.match(sql, /safe_patch := safe_patch \|\| jsonb_build_object/i);
  assert.match(sql, /client_mutations/i);
  assert.match(sql, /resolve_sync_conflict/i);
  assert.match(sql, /conflict_changed_again/i);
});

test("manual changes append history, audit, and field locks", async () => {
  const sql = await readMigrations();
  assert.match(sql, /insert into public\.field_locks[\s\S]+user_manual_edit/i);
  assert.match(sql, /insert into public\.timeline_entries/i);
  assert.match(sql, /workspace\.manual_update/i);
  assert.match(sql, /append_workspace_creation/i);
  assert.match(sql, /row_payload jsonb := to_jsonb\(new\)/i);
});

test("M3 keeps Data API exposure explicit and respects privacy lock", async () => {
  const sql = await readMigrations();
  assert.match(sql, /revoke all on[\s\S]+public\.sync_conflicts[\s\S]+from anon, authenticated/i);
  assert.match(sql, /grant select, insert, update, delete on[\s\S]+to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all)[\s\S]*?\s+to\s+anon/i);
  assert.match(sql, /private\.m3_writes_allowed\(user_id\)/i);
  assert.match(sql, /privacy_locked/i);
  assert.match(sql, /grant execute on function private\.m3_writes_allowed\(uuid\) to authenticated, service_role/i);
  assert.doesNotMatch(sql, /grant execute on all functions in schema private/i);
});
