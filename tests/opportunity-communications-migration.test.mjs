import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112160000_opportunity_communications.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../apps/web/src/app/(app)/inbox/actions.ts", import.meta.url), "utf8");

test("links are owner-read-only and written only through definer functions", () => {
  assert.match(migration, /alter table public\.opportunity_communications enable row level security/);
  assert.match(migration, /revoke all on table public\.opportunity_communications from public, anon, authenticated;/);
  assert.match(migration, /grant select on table public\.opportunity_communications to authenticated;/);
  assert.match(migration, /unique index opportunity_communications_one_link_idx[\s\S]+where status = 'linked'/);
});

test("suggestions require a unique match and never touch the opportunity stage", () => {
  assert.equal((migration.match(/cardinality\(hits\) = 1/g) ?? []).length, 4);
  assert.doesNotMatch(migration, /update public\.opportunities/i);
  assert.doesNotMatch(migration, /main_stage\s*=/);
  assert.match(migration, /'stageChanged', false/);
});

test("definer code never relies on temp tables (shadowing risk)", () => {
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ""), /create temp/i);
});

test("decisions are privacy-locked, owner-checked, audited and reversible", () => {
  assert.match(migration, /private\.m3_writes_allowed\(actor_user_id\)/);
  assert.match(migration, /where id = target_link_id and user_id = actor_user_id for update/);
  assert.match(migration, /'communication_linked'/);
  assert.match(migration, /'communication_unlinked'/);
  assert.match(migration, /'communication\.' \|\| target_decision/);
  assert.match(migration, /revoke all on function public\.decide_my_communication_link\(uuid, text\) from public, anon;/);
});

test("no outbound e-mail capability is introduced", () => {
  for (const source of [migration, actions]) assert.doesNotMatch(source, /net\.http_|gmail\.send|messages\/send|sendmail/i);
});
