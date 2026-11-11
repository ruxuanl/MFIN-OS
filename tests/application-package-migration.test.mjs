import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112110000_application_packages.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../apps/web/src/app/(app)/applications/actions.ts", import.meta.url), "utf8");
const rules = await readFile(new URL("../apps/web/src/lib/applications/package-rules.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../apps/web/src/components/application-package-panel.tsx", import.meta.url), "utf8");

test("package tables are owner-readable and not directly writable by browser roles", () => {
  assert.match(migration, /alter table public\.application_packages enable row level security/i);
  assert.match(migration, /alter table public\.application_package_items enable row level security/i);
  assert.match(migration, /revoke all on table public\.application_packages, public\.application_package_items from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.application_packages, public\.application_package_items to authenticated;/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*to authenticated/i);
});

test("writes go through invoker wrappers over definer functions that check the caller and privacy lock", () => {
  for (const name of ["create_application_package", "confirm_application_package_resume", "set_application_package_item", "set_application_package_status"]) {
    assert.match(migration, new RegExp(`create function private\\.${name}\\([\\s\\S]+?security definer\\s+set search_path = ''`, "i"));
  }
  assert.equal((migration.match(/private\.m3_writes_allowed\(actor_user_id\)/g) ?? []).length, 4);
  assert.match(migration, /create function public\.create_my_application_package[\s\S]+?security invoker/i);
  assert.match(migration, /revoke all on function public\.create_my_application_package[\s\S]+?from public, anon/i);
});

test("the package cannot be marked submitted here and only the user's own records are touched", () => {
  assert.match(migration, /target_status not in \('draft', 'ready', 'abandoned'\)/);
  assert.match(migration, /where id = target_opportunity_id and user_id = actor_user_id/);
  assert.match(migration, /official_apply_url ~ '\^https:\/\/'/);
  assert.match(migration, /insert into public\.timeline_entries/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("application package code has no submission, sign-in, messaging or outbound network path", () => {
  for (const source of [migration, actions, rules, panel]) {
    assert.doesNotMatch(source, /net\.http_|fetch\(|XMLHttpRequest|nodemailer|sendmail|gmail\.users\.messages\.send|submit_application|apply_job/i);
  }
  assert.doesNotMatch(panel, /<form[^>]+action=["']https?:/i, "no form posts to an external site");
  assert.match(panel, /target="_blank" rel="noreferrer noopener"/, "official link only opens a new tab");
});
