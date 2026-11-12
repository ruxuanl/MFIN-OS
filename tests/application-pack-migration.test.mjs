import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112180000_application_pack_drafts.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../apps/web/src/app/(app)/applications/draft-actions.ts", import.meta.url), "utf8");
const openai = await readFile(new URL("../apps/web/src/lib/ai/openai-analysis.ts", import.meta.url), "utf8");
const pack = await readFile(new URL("../apps/web/src/lib/ai/application-pack.ts", import.meta.url), "utf8");

test("application_pack uses the material-draft permission and the shared monthly budget", () => {
  assert.match(migration, /when 'application_pack' then 'ai\.material_draft'/);
  assert.match(migration, /spent_and_reserved \+ target_reserve_hkd_cents > 10000/);
  assert.match(migration, /analysis_kind in \('resume', 'jd_match', 'application_pack'\)/);
});

test("completion audit uses an allowed actor type (fixes the 'automation' rejection)", () => {
  const code = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /'automation'/);
  assert.match(code, /actor_user_id, 'ai', 'ai\.analysis_completed'/);
});

test("AI output never overwrites a locked (user-edited) draft", () => {
  assert.match(migration, /where not public\.application_drafts\.locked;/);
  assert.match(migration, /check \(source = 'ai' or locked\)/);
  assert.match(migration, /draft_version_conflict/);
  assert.match(migration, /'lockedFieldsPreserved', true/);
});

test("drafts are owner-read-only and every write is privacy-locked", () => {
  assert.match(migration, /revoke all on table public\.application_drafts from public, anon, authenticated;/);
  assert.match(migration, /grant select on table public\.application_drafts to authenticated;/);
  assert.ok((migration.match(/private\.m3_writes_allowed\(actor_user_id\)/g) ?? []).length >= 5);
});

test("calls stay store=false, cached by fingerprint, and send only the whitelisted payload", () => {
  assert.match(openai, /store: false/);
  assert.match(openai, /generateApplicationPack\(safetyIdentifier: string, payload: PackPayload\)/);
  assert.match(actions, /eq\("analysis_kind", "application_pack"\)[\s\S]+eq\("input_fingerprint", fingerprint\)/);
  assert.match(actions, /packReserveHkdCents\(payload, config\)/);
  assert.match(actions, /selected_resume_version_id/);
  assert.match(pack, /export const packPayloadKeys = \["jd", "resume", "questions"\] as const;/);
});

test("nothing submits, sends or fills a form", () => {
  for (const source of [migration, actions, pack]) {
    assert.doesNotMatch(source, /net\.http_|sendmail|submit_application|apply_job|puppeteer|playwright/i);
  }
});
