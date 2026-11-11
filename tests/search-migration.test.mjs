import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112130000_search_documents.sql", import.meta.url), "utf8");
const page = await readFile(new URL("../apps/web/src/app/(app)/search/page.tsx", import.meta.url), "utf8");
const data = await readFile(new URL("../apps/web/src/lib/search/data.ts", import.meta.url), "utf8");

test("search index is owner-read-only and only written by definer projections", () => {
  assert.match(migration, /alter table public\.search_documents enable row level security/i);
  assert.match(migration, /revoke all on table public\.search_documents from public, anon, authenticated/i);
  assert.match(migration, /grant select on table public\.search_documents to authenticated;/i);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[^;]*search_documents/i);
  assert.match(migration, /unique \(object_type, object_id\)/i);
});

test("index is kept current by triggers on every searchable source", () => {
  for (const table of ["opportunities", "opportunity_candidates", "gmail_messages"]) {
    assert.match(migration, new RegExp(`after insert or update or delete on public\\.${table}`, "i"), table);
  }
});

test("projections never copy full email bodies and cap indexed text", () => {
  const gmail = migration.slice(migration.indexOf("search_project_gmail_message"), migration.indexOf("search_index_trigger"));
  assert.doesNotMatch(gmail, /body_text|raw_body|html_body|snippet_full/i);
  assert.match(migration, /check \(length\(body\) <= 8000\)/);
  assert.match(migration, /left\(o\.raw_jd, 6000\)/);
});

test("search and rebuild respect auth and the privacy lock", () => {
  assert.equal((migration.match(/raise exception 'privacy_locked'/g) ?? []).length, 2);
  assert.match(migration, /invalid_search/);
  assert.match(migration, /revoke all on function public\.search_my_workspace[^;]+from public, anon/i);
  assert.match(migration, /grant execute on function public\.search_my_workspace[^;]+to authenticated/i);
  assert.match(migration, /escape '\\'/);
  assert.match(migration, /revoke all on function private\.rebuild_search_documents\(uuid\) from public, anon, authenticated;/i);
  assert.doesNotMatch(migration, /grant execute on function private\.rebuild_search_documents\(uuid\) to authenticated/i);
});

test("search page shows source and time, and calls only the RPC", () => {
  assert.match(page, /来源：/);
  assert.match(page, /索引于/);
  assert.match(data, /rpc\("search_my_workspace"/);
  assert.doesNotMatch(data, /from\("search_documents"\)\.(insert|update|delete)/);
});
