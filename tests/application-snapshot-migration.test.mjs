import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112120000_application_snapshots.sql", import.meta.url), "utf8");
const actions = await readFile(new URL("../apps/web/src/app/(app)/applications/actions.ts", import.meta.url), "utf8");
const panel = await readFile(new URL("../apps/web/src/components/application-submission-panel.tsx", import.meta.url), "utf8");

test("snapshots are immutable apart from a single undo transition", () => {
  assert.match(migration, /create trigger application_snapshots_immutable before update on public\.application_snapshots/i);
  assert.match(migration, /old\.status = 'active' and new\.status = 'undone'/);
  assert.match(migration, /\(to_jsonb\(new\) - 'status' - 'undone_at'\) = \(to_jsonb\(old\) - 'status' - 'undone_at'\)/);
  assert.match(migration, /application_snapshot_is_immutable/);
  assert.match(migration, /unique index application_snapshots_one_active_idx[\s\S]+where status = 'active'/i);
});

test("snapshot keeps copies, not live references, of what was submitted", () => {
  for (const column of ["jd_text", "resume_version_id uuid,", "resume_label", "checklist", "answers_text", "application_reference", "submitted_at"]) {
    assert.ok(migration.includes(column), column);
  }
  assert.doesNotMatch(migration, /resume_version_id uuid references/i);
});

test("recording and undo are owner-only, privacy-locked and audited", () => {
  assert.match(migration, /revoke all on table public\.application_snapshots from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.application_snapshots to authenticated;/i);
  assert.equal((migration.match(/private\.m3_writes_allowed\(actor_user_id\)/g) ?? []).length, 2);
  assert.match(migration, /opportunity_changed_since_submission/);
  assert.match(migration, /'externalAction', false/);
  assert.match(migration, /insert into public\.audit_events/);
});

test("the submission flow has no external action", () => {
  for (const source of [migration, actions, panel]) {
    assert.doesNotMatch(source, /net\.http_|fetch\(|XMLHttpRequest|sendmail|submit_application|apply_job/i);
  }
  assert.doesNotMatch(panel, /<form[^>]+action=["']https?:/i);
});
