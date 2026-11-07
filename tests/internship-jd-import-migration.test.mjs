import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260830205912_internship_jd_import.sql", import.meta.url), "utf8");
const metadataMigration = await readFile(new URL("../supabase/migrations/20260831003230_improve_internship_jd_metadata.sql", import.meta.url), "utf8");

test("JD import stores the bounded source and extracted core fields", () => {
  for (const field of [
    "raw_jd", "responsibilities", "requirements", "application_method",
    "parser_version", "extraction_confidence", "extraction_gaps", "jd_fingerprint"
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`, "i"));
  assert.match(migration, /length\(target_raw_jd\) not between 20 and 50000/i);
  assert.match(migration, /target_stage not in \('evaluation', 'preparation', 'submitted'\)/i);
  assert.match(migration, /track, intent, company[\s\S]+?'internship'/i);
});

test("JD import is owner-scoped, idempotent, auditable, and invoker-only", () => {
  assert.match(migration, /create function public\.import_my_internship_jd[\s\S]+security invoker[\s\S]+set search_path = ''/i);
  assert.match(migration, /actor_user_id uuid := auth\.uid\(\)/i);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /opportunity_candidates_user_jd_fingerprint_idx/i);
  assert.match(migration, /insert into public\.timeline_entries/i);
  assert.match(migration, /insert into public\.audit_events/i);
  assert.match(migration, /revoke execute on function public\.import_my_internship_jd[\s\S]+from public, anon, authenticated/i);
  assert.match(migration, /grant execute on function public\.import_my_internship_jd[\s\S]+to authenticated, service_role/i);
  assert.doesNotMatch(migration, /security definer/i);
});

test("JD import never performs an application or external write", () => {
  assert.doesNotMatch(migration, /http_|net\.|webhook|send_message|submit_application|apply_job/i);
  assert.doesNotMatch(metadataMigration, /http_|net\.|webhook|send_message|submit_application|apply_job/i);
});

test("JD metadata upgrade stores posting dates and keeps the RPC invoker-only", () => {
  assert.match(metadataMigration, /alter table public\.opportunity_candidates[\s\S]+add column posted_on date/i);
  assert.match(metadataMigration, /alter table public\.opportunities[\s\S]+add column posted_on date/i);
  assert.match(metadataMigration, /target_posted_on date/i);
  assert.match(metadataMigration, /security invoker/i);
  assert.match(metadataMigration, /'unspecified'/i);
  assert.match(metadataMigration, /revoke execute[\s\S]+from public, anon, authenticated/i);
  assert.doesNotMatch(metadataMigration, /security definer/i);
});
