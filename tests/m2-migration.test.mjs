import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function readM2Migrations() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return (await Promise.all(names.map((name) => readFile(path.join(directory, name), "utf8")))).join("\n");
}

test("M2 enables RLS on every browser-reachable table", async () => {
  const sql = await readM2Migrations();
  for (const table of [
    "capability_definitions",
    "permission_grants",
    "privacy_locks",
    "audit_events",
    "field_locks",
    "undo_operations",
    "automation_runs",
    "automation_attempts"
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
  assert.match(sql, /alter table private\.secret_references enable row level security/i);
});

test("M2 keeps permanent external actions out of the capability registry", async () => {
  const sql = await readM2Migrations();
  for (const capability of ["gmail.send", "wechat.send", "job.apply", "application.submit", "offer.accept"]) {
    assert.match(sql, new RegExp(`'${capability.replace(".", "\\.")}'`));
  }
  assert.match(sql, /constraint forbidden_capability_keys/i);
});

test("M2 enforces privacy, sensitive-payload, and task safety at the database layer", async () => {
  const sql = await readM2Migrations();
  assert.match(sql, /privacy_lock_after_change/i);
  assert.match(sql, /permission_revoked/i);
  assert.match(sql, /contains_sensitive_key/i);
  assert.match(sql, /dead_letter/i);
  assert.match(sql, /fresh_reauthentication_required/i);
});

test("M2 uses explicit Data API grants and no anonymous table grants", async () => {
  const sql = await readM2Migrations();
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/i);
  assert.match(sql, /grant select on public\.capability_definitions, public\.capability_dependencies to authenticated/i);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all).*\s+to\s+anon/i);
});
