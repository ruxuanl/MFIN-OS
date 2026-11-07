import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20260831005716_resume_ai_workspace.sql", import.meta.url), "utf8");
const storageGuard = await readFile(new URL("../supabase/migrations/20260831012457_resume_storage_registration_guard.sql", import.meta.url), "utf8");

test("resume files are private, owner-scoped, bounded, and versioned", () => {
  assert.match(migration, /'resume-files', 'resume-files', false, 10485760/i);
  assert.match(migration, /allowed_mime_types[\s\S]+application\/pdf[\s\S]+wordprocessingml/i);
  assert.match(migration, /resume_documents_one_master_idx[\s\S]+document_kind = 'master'/i);
  assert.match(migration, /unique \(document_id, version_number\)/i);
  assert.match(migration, /resume_files_storage_read_own[\s\S]+auth\.uid\(\)/i);
  assert.doesNotMatch(migration, /create policy[\s\S]{0,180}resume-files[\s\S]{0,180}for insert to authenticated/i);
  assert.match(storageGuard, /storage\.objects[\s\S]+resume_file_not_uploaded/i);
});

test("opportunity assignments retain exact versions and append history", () => {
  assert.match(migration, /create table public\.opportunity_resume_assignments/i);
  assert.match(migration, /resume_version_id uuid not null references public\.resume_versions/i);
  assert.match(migration, /opportunity_resume_assignments_current_idx[\s\S]+where is_current/i);
  assert.match(migration, /resume_version_selected/i);
});

test("AI uses explicit permissions, caching, and a HK$100 hard reservation cap", () => {
  for (const capability of ["ai.resume_analysis", "ai.jd_analysis", "ai.material_draft"]) {
    assert.match(migration, new RegExp(capability.replace(".", "\\."), "i"));
  }
  assert.match(migration, /unique \(user_id, analysis_kind, input_fingerprint, prompt_version\)/i);
  assert.match(migration, /pg_advisory_xact_lock[\s\S]+:ai_budget/i);
  assert.match(migration, /spent_and_reserved \+ target_reserve_hkd_cents > 10000/i);
  assert.match(migration, /reserve_my_ai_usage/i);
  assert.match(migration, /actual_hkd_cents[\s\S]+reserved_hkd_cents/i);
});

test("AI and resume functions expose invoker wrappers only to signed-in roles", () => {
  for (const name of ["register_my_resume_version", "assign_my_opportunity_resume", "reserve_my_ai_usage", "complete_my_ai_analysis"]) {
    assert.match(migration, new RegExp(`create function public\\.${name}[\\s\\S]+?security invoker`, "i"));
    assert.match(migration, new RegExp(`revoke execute on function public\\.${name}[\\s\\S]+?from public, anon`, "i"));
  }
  assert.doesNotMatch(migration, /send_message|submit_application|apply_job|gmail\.send|emails\.send/i);
});
