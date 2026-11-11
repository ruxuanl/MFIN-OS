import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112140000_candidate_batch_decisions.sql", import.meta.url), "utf8");
const pool = await readFile(new URL("../apps/web/src/components/candidate-pool.tsx", import.meta.url), "utf8");

test("batch decisions run per item in isolated subtransactions", () => {
  assert.match(migration, /foreach item_id in array/);
  assert.match(migration, /exception when others then[\s\S]+outcome := 'failed'/);
  assert.match(migration, /outcome := 'unchanged'/, "re-applying a decision is idempotent");
  assert.match(migration, /cardinality\(target_candidate_ids\) not between 1 and 100/);
});

test("batch decisions are owner-scoped, privacy-locked and audited per item", () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /c\.user_id = actor_user_id/);
  assert.match(migration, /private\.m3_writes_allowed\(actor_user_id\)/);
  assert.match(migration, /insert into public\.timeline_entries/);
  assert.match(migration, /'candidate\.decide'/);
  assert.match(migration, /'externalAction', false/);
  assert.match(migration, /revoke all on function public\.decide_my_candidates\(uuid\[\], text, text\) from public, anon;/);
  assert.match(migration, /dismiss_reason_required/);
});

test("promotion stays an explicit user choice and nothing is submitted", () => {
  assert.match(migration, /public\.promote_opportunity_candidate\(item_id, target_decision\)/);
  for (const source of [migration, pool]) {
    assert.doesNotMatch(source, /net\.http_|XMLHttpRequest|sendmail|submit_application|apply_job/i);
  }
  assert.match(pool, /useOptimistic/);
});
