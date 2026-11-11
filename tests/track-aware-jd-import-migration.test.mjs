import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112090000_track_aware_jd_import.sql", import.meta.url), "utf8");
const web = await readFile(new URL("../apps/web/src/app/(app)/workspace-actions.ts", import.meta.url), "utf8");
const workspace = await readFile(new URL("../apps/web/src/components/opportunity-workspace.tsx", import.meta.url), "utf8");

test("track-aware JD import accepts only the two tracks and writes the chosen one", () => {
  assert.match(migration, /create function public\.import_my_jd\(\s*target_track text,/i);
  assert.match(migration, /target_track not in \('internship', 'graduate'\)/i);
  assert.match(migration, /actor_user_id, target_track, btrim\(target_company\)/i);
  assert.match(migration, /actor_user_id, new_candidate_id, target_track,/i);
  assert.match(migration, /target_track \|\| '\.jd_import'/i);
});

test("track-aware JD import keeps the original bounds and stays idempotent across tracks", () => {
  assert.match(migration, /length\(target_raw_jd\) not between 20 and 50000/i);
  assert.match(migration, /target_stage not in \('evaluation', 'preparation', 'submitted'\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /candidate\.jd_fingerprint = target_jd_fingerprint/i);
  assert.match(migration, /return query select existing_opportunity_id, false, existing_track/i);
  assert.match(migration, /insert into public\.timeline_entries/i);
  assert.match(migration, /insert into public\.audit_events/i);
});

test("track-aware JD import is owner-scoped, invoker-only and has no external write", () => {
  assert.match(migration, /security invoker[\s\S]+set search_path = ''/i);
  assert.match(migration, /actor_user_id uuid := auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /revoke execute on function public\.import_my_jd[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.import_my_jd[\s\S]+to authenticated, service_role/i);
  assert.doesNotMatch(migration, /http_|net\.|webhook|send_message|submit_application|apply_job/i);
  assert.doesNotMatch(migration, /create or replace function public\.import_my_internship_jd/i);
});

test("both workspaces render the paste importer and the action passes the track", () => {
  assert.match(workspace, /<JdImporter track=\{track\} \/>/);
  assert.match(web, /supabase\.rpc\("import_my_jd"/);
  assert.match(web, /target_track: track/);
});
