// Optional integration tests against a throwaway local PostgreSQL.
// Skipped unless MFIN_TEST_PG=1 and libpq env vars (PGHOST, PGPORT, PGUSER) point at a
// disposable server. They apply tests/db/supabase-stub.sql plus every migration to a
// fresh database, then exercise the seed and the track-aware JD import as a real user.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSeedData, buildSeedSql, buildUnseedSql } from "../scripts/test-env/seed-data.mjs";

const enabled = process.env.MFIN_TEST_PG === "1";
const db = "mfin_integration";
const user = "33333333-3333-4333-8333-333333333333";

function psql(sql) {
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql], { encoding: "utf8" }).trim();
}
function psqlFile(file) {
  execFileSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", file], { stdio: "pipe" });
}
function asUser(sql) {
  return psql(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${user}","role":"authenticated"}', true) is null; ${sql}; rollback;`)
    .split("\n").slice(1).join("\n");
}

test("migrations, seed and JD import on a real PostgreSQL", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  execFileSync("bash", [path.join("tests", "db", "apply-migrations.sh"), db], { stdio: "pipe" });
  psql(`insert into auth.users (id, email) values ('${user}', 'synthetic@example.invalid')`);

  const dir = mkdtempSync(path.join(tmpdir(), "mfin-seed-"));
  const data = buildSeedData();
  writeFileSync(path.join(dir, "seed.sql"), buildSeedSql(data));
  writeFileSync(path.join(dir, "unseed.sql"), buildUnseedSql(data));

  psqlFile(path.join(dir, "seed.sql"));
  psqlFile(path.join(dir, "seed.sql"));
  assert.equal(psql("select count(*) from public.opportunities"), String(data.opportunities.length), "seed is idempotent");
  assert.equal(asUser("select count(*) from public.opportunities"), String(data.opportunities.length), "owner can read via RLS");

  psqlFile(path.join(dir, "unseed.sql"));
  assert.equal(psql(`select (select count(*) from public.opportunities) + (select count(*) from public.opportunity_candidates)
    + (select count(*) from public.gmail_messages) + (select count(*) from public.calendar_events)
    + (select count(*) from public.timeline_entries) + (select count(*) from public.external_connections)`), "0", "cleanup leaves nothing");

  const args = `'示例资本','Graduate Analyst',null,'上海',null,null,null,'${"合成 JD 正文 ".repeat(5)}','研究支持','熟悉 Excel',null,'jd_rules_v2',0.7,array['部门'],'${"c".repeat(64)}','evaluation',null`;
  const first = asUser(`select created, opportunity_track from public.import_my_jd('graduate', ${args})`);
  assert.equal(first, "t|graduate");
  const duplicate = asUser(`select public.import_my_jd('graduate', ${args}); select created, opportunity_track from public.import_my_jd('internship', ${args})`);
  assert.match(duplicate, /f\|graduate$/, "duplicate JD returns the original track");
  assert.throws(() => asUser(`select public.import_my_jd('bogus', ${args})`), /invalid_jd_import/);
});

test("application package: create once, checklist, status rules, privacy lock", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const jd = `'示例资本','Graduate Analyst',null,'上海',current_date + 5,null,'https://careers.sample.example/1','${"合成 JD 正文 ".repeat(5)}','研究支持','熟悉 Excel',null,'jd_rules_v2',0.7,array[]::text[],'${"e".repeat(64)}','evaluation',null`;
  const items = `'[{"key":"cv","label":"简历","required":true,"source":"default"},{"key":"transcript","label":"成绩单","required":true,"source":"jd_rule","evidence":"attach transcript"}]'::jsonb`;
  const setup = `create temp table t as select opportunity_id from public.import_my_jd('graduate', ${jd});
    create temp table p as select * from public.create_my_application_package((select opportunity_id from t), ${items}, null, 'r', 'https://careers.sample.example/1', current_date + 1, 'package_rules_v1')`;
  const result = asUser(`${setup};
    select (select created from p), (select created from public.create_my_application_package((select opportunity_id from t), '[]'::jsonb, null, null, null, null, 'package_rules_v1')),
      (select count(*) from public.application_package_items), (select priority from public.actions limit 1)`);
  assert.equal(result.split("\n").pop(), "t|f|2|high", "created once, items stored, deadline action is high priority");

  const blocked = () => asUser(`${setup}; select public.set_my_application_package_status((select package_id from p), 'submitted_recorded')`);
  assert.throws(blocked, /invalid_package_status/, "submitted_recorded is reserved for #14");
  assert.throws(() => asUser(`${setup}; update public.application_packages set status = 'ready'`), /permission denied/, "no direct writes");

  const locked = () => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked) values ('${user}', true)
      on conflict (user_id) do update set is_locked = true;
    set local role authenticated;
    select public.set_my_application_package_status((select package_id from p), 'ready')`);
  assert.throws(locked, /privacy_locked/, "privacy lock blocks package writes");
});

test("submission record: snapshot, immutability, undo and re-record", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const jd = `'示例资本','Summer Analyst',null,'香港',current_date + 5,null,'https://careers.sample.example/2','${"合成 JD 正文 ".repeat(5)}','研究支持','熟悉 Excel',null,'jd_rules_v2',0.8,array[]::text[],'${"f".repeat(64)}','preparation',null`;
  const setup = `create temp table t as select opportunity_id from public.import_my_jd('internship', ${jd});
    create temp table p as select * from public.create_my_application_package((select opportunity_id from t), '[{"key":"cv","label":"简历","required":true,"source":"default"}]'::jsonb, null, 'r', null, null, 'package_rules_v1');
    create temp table s as select public.record_my_application_submitted((select opportunity_id from t), current_date, 'REF-1', null) as id`;
  const after = asUser(`${setup};
    select (select main_stage from public.opportunities), (select status from public.application_packages),
      (select status from public.actions), (select application_reference from public.application_snapshots)`);
  assert.equal(after.split("\n").pop(), "submitted|submitted_recorded|completed|REF-1");

  assert.throws(() => asUser(`${setup}; select public.record_my_application_submitted((select opportunity_id from t), null, null, null)`),
    /submission_already_recorded/);
  assert.throws(() => asUser(`${setup}; reset role; update public.application_snapshots set application_reference = 'x'`),
    /application_snapshot_is_immutable/);

  const undone = asUser(`${setup}; select public.undo_my_application_submitted((select id from s));
    select (select main_stage from public.opportunities), (select status from public.application_packages),
      (select status from public.actions), (select status from public.application_snapshots),
      (select public.record_my_application_submitted((select opportunity_id from t), null, null, null) is not null)`);
  assert.equal(undone.split("\n").pop(), "preparation|draft|unscheduled|undone|t");

  assert.throws(() => asUser(`${setup}; update public.opportunities set substage = 'x', version = version + 1;
    select public.undo_my_application_submitted((select id from s))`), /opportunity_changed_since_submission/);
});


test("search v1: Chinese substrings, AND terms, filters, trigger upkeep, privacy lock", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const jd = (company, role, location, hash) => `'${company}','${role}',null,'${location}',current_date + 7,null,null,'${"合成投行岗位描述 Python 建模 ".repeat(3)}','研究支持','熟悉 Excel',null,'jd_rules_v2',0.7,array[]::text[],'${hash.repeat(64)}','evaluation',null`;
  const setup = `select public.import_my_jd('graduate', ${jd("搜索示例资本", "投行分析师", "上海", "a")});
    select public.import_my_jd('internship', ${jd("另一示例银行", "Summer Analyst", "香港", "b")})`;
  const search = (args) => asUser(`${setup}; select coalesce(string_agg(title, ',' order by title), '∅') from public.search_my_workspace(${args})`).split("\n").pop();

  assert.match(search("'投行'"), /投行分析师/, "two-character Chinese term matches");
  assert.equal(search("'python 上海'"), "搜索示例资本 · 投行分析师", "AND across body terms, including location");
  assert.equal(search("'投行 python', target_track => 'internship'"), "另一示例银行 · Summer Analyst", "AND terms plus track filter");
  assert.equal(search("'', target_company => '搜索示例'"), "搜索示例资本 · 投行分析师", "company filter alone");
  assert.equal(search("'不存在的词'"), "∅", "no false positives");
  assert.equal(search("'%'"), "∅", "LIKE wildcards are escaped");

  const removed = asUser(`${setup}; delete from public.opportunities where company = '另一示例银行';
    select count(*) from public.search_documents`).split("\n").pop();
  assert.equal(removed, "1", "delete trigger removes the document");

  const rebuilt = asUser(`${setup}; select public.rebuild_my_search_documents()`).split("\n").pop();
  assert.equal(rebuilt, "2", "rebuild re-projects from source rows");
  assert.throws(() => asUser(`select private.rebuild_search_documents('${user}')`), /permission denied/, "no cross-user rebuild");
  assert.throws(() => asUser(`select * from public.search_my_workspace('${"x".repeat(201)}')`), /invalid_search/);

  const locked = (sql) => () => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked, locked_at) values ('${user}', true, now())
      on conflict (user_id) do update set is_locked = true, locked_at = now();
    set local role authenticated; ${sql}`);
  assert.throws(locked("select * from public.search_my_workspace('投行')"), /privacy_locked/);
  assert.throws(locked("select public.rebuild_my_search_documents()"), /privacy_locked/);
  assert.throws(() => psql("begin; set local role anon; select * from public.search_my_workspace('投行'); rollback"), /permission denied/);
});
