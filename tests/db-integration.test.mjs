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

test("candidate batch: partial failure, idempotence, per-item audit, privacy lock", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const ids = ["c1000000-0000-4000-8000-000000000001", "c1000000-0000-4000-8000-000000000002", "c1000000-0000-4000-8000-000000000003"];
  const missing = "c1000000-0000-4000-8000-0000000000ff";
  const setup = `reset role; insert into public.opportunity_candidates (id, user_id, track, company, role_title) values
    ${ids.map((id, index) => `('${id}', '${user}', 'graduate', '批量示例${index}', '分析师')`).join(", ")};
    set local role authenticated`;
  const arr = (list) => `array[${list.map((id) => `'${id}'`).join(",")}]::uuid[]`;
  const last = (sql) => asUser(`${setup}; ${sql}`).split("\n").pop();

  assert.equal(last(`select string_agg(outcome || coalesce(':' || error_code, ''), ',' order by candidate_id) from public.decide_my_candidates(${arr([ids[0], ids[1], missing])}, 'later')`),
    "updated,updated,failed:candidate_not_found", "one bad id does not roll back the others");
  assert.equal(last(`select public.decide_my_candidates(${arr([ids[0]])}, 'later');
    select string_agg(outcome, ',') from public.decide_my_candidates(${arr([ids[0]])}, 'later')`), "unchanged");
  assert.equal(last(`select public.decide_my_candidates(${arr(ids)}, 'track');
    select string_agg(outcome || coalesce(':' || error_code, ''), ',' order by candidate_id) from public.decide_my_candidates(${arr(ids)}, 'dismissed', '不匹配')`),
    "failed:candidate_already_promoted,failed:candidate_already_promoted,failed:candidate_already_promoted");
  assert.equal(last(`select public.decide_my_candidates(${arr(ids)}, 'apply'); select public.decide_my_candidates(${arr(ids)}, 'track');
    select (select count(*) from public.opportunities where candidate_id = any(${arr(ids)})) || '|' ||
      (select count(*) from public.audit_events where action = 'candidate.promote' and object_id = any(${arr(ids)}::text[]))`),
    "3|3", "repeat promotion creates no duplicates");
  assert.equal(last(`select public.decide_my_candidates(${arr(ids.slice(0, 2))}, 'dismissed', '地点不合适');
    select (select count(*) from public.timeline_entries where event_type = 'decision_changed') || '|' ||
      (select count(*) from public.audit_events where action = 'candidate.decide')`), "2|2");
  assert.throws(() => asUser(`${setup}; select public.decide_my_candidates(${arr([ids[0]])}, 'dismissed')`), /dismiss_reason_required/);
  assert.throws(() => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked, locked_at) values ('${user}', true, now())
      on conflict (user_id) do update set is_locked = true, locked_at = now();
    set local role authenticated; select public.decide_my_candidates(${arr([ids[0]])}, 'later')`), /privacy_locked/);
});

test("search gold set: v1 recall@5 >= 0.85 and beats the includes() baseline", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, async () => {
  const { runSearchEval } = await import("../scripts/search-eval/run.mjs");
  const { v1, baseline } = runSearchEval({ db, applyMigrations: false });
  assert.ok(v1.recallAt5 >= 0.85, `recall@5 ${v1.recallAt5}`);
  assert.ok(v1.mrr > baseline.mrr && v1.recallAt5 > baseline.recallAt5);
});

test("deadline reminders: 7/3/1 tiers, rules_v2 top three, 24h push de-duplicated", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const today = "(now() at time zone 'Asia/Hong_Kong')::date";
  const setup = `reset role;
    insert into public.permission_grants (user_id, capability_key, mode) values
      ('${user}', 'reports.generate', 'persistent'), ('${user}', 'notifications.smart_push', 'persistent')
      on conflict (user_id, capability_key) do update set mode = 'persistent', active = true;
    insert into public.opportunities (user_id, track, intent, company, role_title, main_stage, deadline) values
      ('${user}', 'graduate', 'track', '提醒七天', 'A', 'evaluation', ${today} + 7),
      ('${user}', 'graduate', 'track', '提醒五天', 'A', 'evaluation', ${today} + 5),
      ('${user}', 'internship', 'track', '提醒三天', 'A', 'preparation', ${today} + 3),
      ('${user}', 'internship', 'track', '提醒已投', 'A', 'submitted', ${today} + 1),
      ('${user}', 'internship', 'track', '提醒今天', 'A', 'evaluation', ${today});
    set local role authenticated;
    select public.create_my_application_package((select id from public.opportunities where company = '提醒三天'),
      '[{"key":"cv","label":"简历","required":true,"source":"default"}]'::jsonb, null, 'r', null, null, 'package_rules_v1')`;
  const morning = asUser(`${setup}; select public.generate_my_report('morning');
    select string_agg(i.section || ':' || split_part(i.title, ' · ', 1), ',' order by i.section, i.position)
      || '|' || (select generation_strategy from public.reports where status <> 'superseded')
    from public.report_items i where i.section in ('deadline', 'focus')`).split("\n").pop();
  const [items, strategy] = morning.split("|");
  assert.equal(strategy, "rules_v2");
  const deadlines = items.split(",").filter((entry) => entry.startsWith("deadline:")).map((entry) => entry.slice(9));
  assert.ok(deadlines.includes("提醒七天") && deadlines.includes("提醒三天"));
  assert.ok(!deadlines.includes("提醒五天") && !deadlines.includes("提醒已投"), "only 7/3/1/0 tiers, unsubmitted jobs");
  assert.match(items, /focus:推进投递包：提醒三天/, "package next step joins the top three");

  const pushes = asUser(`${setup}; reset role; select private.enqueue_due_deadline_notifications(); select private.enqueue_due_deadline_notifications();
    select count(*) || ':' || count(*) filter (where title like '%提醒今天%') from public.notifications where notification_type = 'deadline_24h'`).split("\n").pop();
  const hongKongHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Hong_Kong", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  assert.equal(pushes, hongKongHour < 18 ? "1:1" : "0:0", "a same-day deadline (18:00 HKT) pushes once; repeated sweeps do not duplicate");

  const denied = asUser(`${setup}; reset role; update public.permission_grants set mode = 'off' where capability_key = 'notifications.smart_push';
    select private.enqueue_deadline_notifications('${user}')`).split("\n").pop();
  assert.equal(denied, "0", "no push without notifications.smart_push");
  assert.throws(() => asUser(`select private.enqueue_due_deadline_notifications()`), /permission denied/);
});

test("mail ↔ opportunity links: unique-match suggestions, confirm / reject / unlink, privacy lock", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const opp = (n) => `f7000000-0000-4000-8000-00000000000${n}`;
  const setup = `reset role;
    insert into public.opportunities (id, user_id, track, intent, company, role_title, main_stage, source_url) values
      ('${opp(1)}', '${user}', 'internship', 'track', '关联示例银行', 'Summer Analyst', 'submitted', 'https://careers.linkbank.example/1'),
      ('${opp(2)}', '${user}', 'graduate', 'track', '关联双岗公司', 'Graduate Analyst', 'submitted', null),
      ('${opp(3)}', '${user}', 'graduate', 'track', '关联双岗公司', 'Research Associate', 'submitted', 'https://jobs.myworkdayjobs.com/x');
    insert into public.gmail_messages (user_id, provider_message_id, provider_thread_id, history_id, received_at, classification,
      sender_summary, subject, summary, gmail_link, confidence) values
      ('${user}', 'lk1', 'lk1', '1', now(), 'job', 'Recruiting · linkbank.example', 'Application received', null, 'https://mail.google.com/mail/u/0/#inbox/lk1', 0.9),
      ('${user}', 'lk2', 'lk2', '1', now(), 'job', 'HR', '关联双岗公司 通知', null, 'https://mail.google.com/mail/u/0/#inbox/lk2', 0.9),
      ('${user}', 'lk3', 'lk3', '1', now(), 'job', 'HR', '关联双岗公司 Research Associate 笔试', null, 'https://mail.google.com/mail/u/0/#inbox/lk3', 0.9),
      ('${user}', 'lk4', 'lk4', '1', now(), 'personal', 'HR', '关联示例银行 年会', null, 'https://mail.google.com/mail/u/0/#inbox/lk4', 0.9);
    set local role authenticated`;
  const link = (message) => `(select c.id from public.opportunity_communications c join public.gmail_messages m on m.id = c.gmail_message_id where m.provider_message_id = '${message}')`;
  const last = (sql) => asUser(`${setup}; ${sql}`).split("\n").pop();

  assert.equal(last(`select string_agg(m.provider_message_id || ':' || c.match_rule || ':' || c.opportunity_id, ',' order by m.provider_message_id)
    from public.opportunity_communications c join public.gmail_messages m on m.id = c.gmail_message_id`),
    `lk1:sender_domain:${opp(1)},lk3:company_and_role:${opp(3)}`, "ambiguous company and personal mail produce no suggestion");

  assert.equal(last(`select public.decide_my_communication_link(${link("lk1")}, 'confirm');
    select (select main_stage from public.opportunities where id = '${opp(1)}') || '|' ||
      (select count(*) from public.timeline_entries where entity_id = '${opp(1)}' and event_type = 'communication_linked') || '|' ||
      public.decide_my_communication_link(${link("lk1")}, 'confirm')`), "submitted|1|linked", "confirm is idempotent and leaves the stage alone");
  assert.equal(last(`select public.decide_my_communication_link(${link("lk1")}, 'confirm'); select public.decide_my_communication_link(${link("lk1")}, 'unlink');
    select count(*) from public.audit_events where action in ('communication.confirm', 'communication.unlink') and object_id = ${link("lk1")}::text`), "2");
  assert.equal(last(`select public.decide_my_communication_link(${link("lk3")}, 'reject');
    reset role; update public.gmail_messages set summary = '再次更新' where provider_message_id = 'lk3'; set local role authenticated;
    select string_agg(status, ',') from public.opportunity_communications c join public.gmail_messages m on m.id = c.gmail_message_id where m.provider_message_id = 'lk3'`),
    "rejected", "a rejected pair is never suggested again");
  assert.throws(() => asUser(`${setup}; select public.decide_my_communication_link(${link("lk3")}, 'unlink')`), /invalid_link_transition/);
  assert.throws(() => asUser(`${setup}; insert into public.opportunity_communications (user_id, opportunity_id, gmail_message_id, match_rule, match_evidence)
    values ('${user}', '${opp(2)}', (select id from public.gmail_messages where provider_message_id = 'lk2'), 'company_name', 'x')`), /permission denied/);
  assert.throws(() => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked, locked_at) values ('${user}', true, now())
      on conflict (user_id) do update set is_locked = true, locked_at = now();
    set local role authenticated; select public.decide_my_communication_link(${link("lk1")}, 'confirm')`), /privacy_locked/);
});

test("skills: dictionary extraction, locks, resume gap and the 20 multi-hop gold questions", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, async () => {
  const { readFileSync } = await import("node:fs");
  const gold = JSON.parse(readFileSync(path.join("tests", "fixtures", "multihop-gold.json"), "utf8"));
  const jobId = (key) => `ab000000-0000-4000-8000-${key.replace("j", "").padStart(12, "0")}`;
  const keyById = new Map(gold.jobs.map((job) => [jobId(job.key), job.key]));
  const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`);
  const today = "(now() at time zone 'Asia/Hong_Kong')::date";
  const resumePath = `${user}/gold/resume.pdf`;
  const setup = [
    "reset role",
    `insert into public.opportunities (id, user_id, track, intent, company, role_title, location, main_stage, requirements, deadline, applied_at) values ${gold.jobs.map((job) =>
      `('${jobId(job.key)}', '${user}', '${job.track}', 'track', ${q(`技能示例公司 ${job.key}`)}, ${q(`岗位 ${job.key}`)}, ${q(job.location)}, '${job.stage}', ${q(job.requirements)},
        ${job.deadlineInDays === undefined ? "null" : `${today} + ${job.deadlineInDays}`}, ${["submitted", "test", "interview", "waiting", "offer"].includes(job.stage) ? "now() - interval '10 days'" : "null"})`).join(", ")}`,
    ...gold.jobs.filter((job) => job.reply).map((job) => `with m as (insert into public.gmail_messages (user_id, provider_message_id, provider_thread_id, history_id, received_at, classification, subject, gmail_link, confidence)
        values ('${user}', 'reply-${job.key}', 'reply-${job.key}', '1', now() - interval '1 day', 'personal', 'reply', 'https://mail.google.com/mail/u/0/#inbox/r', 0.9) returning id)
      insert into public.opportunity_communications (user_id, opportunity_id, gmail_message_id, status, match_rule, match_evidence, decided_at)
        select '${user}', '${jobId(job.key)}', m.id, 'linked', 'company_name', 'gold', now() from m`),
    `insert into storage.objects (bucket_id, name) values ('resume-files', '${resumePath}')`,
    `insert into public.resume_documents (id, user_id, label, document_kind) values ('ac000000-0000-4000-8000-000000000001', '${user}', 'Master', 'master')`,
    `insert into public.resume_versions (id, user_id, document_id, version_number, storage_path, original_filename, mime_type, size_bytes, content_sha256, extracted_character_count)
      values ('ac000000-0000-4000-8000-000000000002', '${user}', 'ac000000-0000-4000-8000-000000000001', 1, '${resumePath}', 'r.pdf', 'application/pdf', 100, repeat('b', 64), 100)`,
    "set local role authenticated",
    `select public.store_my_resume_text('ac000000-0000-4000-8000-000000000002', ${q(gold.resume)})`
  ].join(";\n");

  const arr = (list) => (list && list.length ? `array[${list.map(q).join(",")}]::text[]` : "null");
  const calls = gold.questions.map((item) => {
    const f = item.filters;
    return `select '${item.id}|' || coalesce((select string_agg(opportunity_id::text, ',') from public.query_my_opportunities(
      target_skills => ${arr(f.skills)}, target_stages => ${arr(f.stages)}, target_track => ${q(f.track)}, target_location => ${q(f.location)},
      target_replied => ${f.replied === null ? "null" : f.replied}, target_resume_gap => ${f.resumeGap === null ? "null" : f.resumeGap},
      target_deadline_within_days => ${f.deadlineWithinDays ?? "null"})), '')`;
  }).join(";\n");
  const output = asUser(`${setup};\n${calls}`).split("\n").filter((line) => /^m\d\d\|/.test(line));
  const correct = output.filter((line) => {
    const [id, ids] = line.split("|");
    const got = (ids ? ids.split(",") : []).map((value) => keyById.get(value) ?? value).sort();
    const expected = gold.questions.find((item) => item.id === id).expected;
    return JSON.stringify(got) === JSON.stringify(expected);
  });
  assert.equal(output.length, 20);
  assert.ok(correct.length / 20 >= 0.8, `multi-hop accuracy ${correct.length}/20: ${output.filter((line) => !correct.includes(line)).join(" ; ")}`);
  assert.equal(correct.length, 20, "every gold question returns exactly the expected jobs");

  const extracted = asUser(`${setup}; reset role;
    insert into public.opportunities (id, user_id, track, intent, company, role_title, main_stage, requirements) values
      ('ab000000-0000-4000-8000-0000000000aa', '${user}', 'internship', 'track', '误匹配测试', 'Intern', 'new', 'HR 面试，R&D 背景，JavaScript，Windows');
    select coalesce(string_agg(skill_key, ','), '∅') from public.opportunity_skills where opportunity_id = 'ab000000-0000-4000-8000-0000000000aa'`).split("\n").pop();
  assert.equal(extracted, "∅", "no R / Java / Wind false positives in SQL either");

  const locked = asUser(`${setup};
    select public.set_my_opportunity_skill('${jobId("j1")}', 'machine_learning', false);
    select public.set_my_opportunity_skill('${jobId("j1")}', 'tableau', true);
    reset role; update public.opportunities set requirements = requirements || '；机器学习' where id = '${jobId("j1")}'; set local role authenticated;
    select string_agg(skill_key || ':' || status || ':' || source, ',' order by skill_key) from public.opportunity_skills where opportunity_id = '${jobId("j1")}'`).split("\n").pop();
  assert.equal(locked, "machine_learning:removed:user,python:active:rule,sql:active:rule,tableau:active:user", "user edits survive re-extraction");

  const gap = asUser(`${setup}; select string_agg(skill_key || ':' || in_resume, ',' order by skill_key) from public.get_my_opportunity_skills('${jobId("j4")}')`).split("\n").pop();
  assert.equal(gap, "cantonese:true,excel:true,financial_modeling:false");

  assert.throws(() => asUser(`select count(*) from private.resume_version_texts`), /permission denied/, "resume text is not reachable from the browser role");
  assert.throws(() => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked, locked_at) values ('${user}', true, now())
      on conflict (user_id) do update set is_locked = true, locked_at = now();
    set local role authenticated; select public.set_my_opportunity_skill('${jobId("j1")}', 'sql', false)`), /privacy_locked/);
});

test("application pack: budget, permission, draft locks, version conflicts, privacy lock", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const opp = "ad000000-0000-4000-8000-000000000001";
  const version = "ad000000-0000-4000-8000-000000000003";
  const result = JSON.stringify({
    coverLetter: { text: "Dear team", confidence: "high", evidence: [{ claim: "x", source: "resume", quote: "y" }], missingInfo: [] },
    gapExplanation: { text: "gap", confidence: "low", evidence: [], missingInfo: ["GPA"] },
    tailoringPoints: { text: "- a", confidence: "high", evidence: [{ claim: "a", source: "jd", quote: "b" }], missingInfo: [] },
    answers: [{ question: "Why us?", text: "Because", confidence: "high", evidence: [{ claim: "c", source: "jd", quote: "d" }], missingInfo: [] }]
  });
  const grants = (mode) => `insert into public.permission_grants (user_id, capability_key, mode) values
      ('${user}', 'ai.master', '${mode}'), ('${user}', 'ai.analysis', '${mode}'), ('${user}', 'ai.material_draft', '${mode}')
      on conflict (user_id, capability_key) do update set mode = '${mode}', active = true`;
  const setup = `reset role; ${grants("persistent")};
    insert into public.opportunities (id, user_id, track, intent, company, role_title, main_stage, raw_jd)
      values ('${opp}', '${user}', 'graduate', 'apply', '草稿示例资本', 'Analyst', 'preparation', repeat('合成 JD 正文 ', 10));
    insert into storage.objects (bucket_id, name) values ('resume-files', '${user}/pack/r.pdf');
    insert into public.resume_documents (id, user_id, label, document_kind) values ('ad000000-0000-4000-8000-000000000002', '${user}', 'Master', 'master');
    insert into public.resume_versions (id, user_id, document_id, version_number, storage_path, original_filename, mime_type, size_bytes, content_sha256, extracted_character_count)
      values ('${version}', '${user}', 'ad000000-0000-4000-8000-000000000002', 1, '${user}/pack/r.pdf', 'r.pdf', 'application/pdf', 10, repeat('e', 64), 10);
    set local role authenticated;
    create temp table u as select public.reserve_my_ai_usage('application_pack', repeat('d', 64), 300) as id;
    create temp table an as select public.complete_my_ai_analysis((select id from u), '${opp}', '${version}', 'test-model', 'application_pack_v1', '${result}'::jsonb, 100, 200, 120) as id`;
  const last = (sql) => asUser(`${setup}; ${sql}`).split("\n").pop();

  assert.equal(last(`select public.apply_my_application_pack((select id from an));
    select string_agg(field_key || ':' || needs_confirmation, ',' order by field_key) from public.application_drafts`),
    "cover_letter:false,gap_explanation:true,qa_1:false,tailoring_points:false", "low confidence or no evidence needs confirmation");
  assert.equal(last(`select public.apply_my_application_pack((select id from an));
    select public.save_my_application_draft('${opp}', 'cover_letter', null, 'My own letter', 1);
    select public.apply_my_application_pack((select id from an)) || '|' ||
      (select body || ':' || locked from public.application_drafts where field_key = 'cover_letter')`), "3|My own letter:true", "a user edit survives regeneration");
  assert.throws(() => asUser(`${setup}; select public.apply_my_application_pack((select id from an));
    select public.save_my_application_draft('${opp}', 'cover_letter', null, 'a', 1); select public.save_my_application_draft('${opp}', 'cover_letter', null, 'b', 1)`), /draft_version_conflict/);
  assert.equal(last(`select public.save_my_application_draft('${opp}', 'qa_2', 'Hand-written question', 'manual answer', null);
    select source || ':' || locked from public.application_drafts where field_key = 'qa_2'`), "user:true", "manual drafts work without AI");
  assert.equal(last(`select (select status from public.ai_usage_events where id = (select id from u)) || '|' ||
    (select count(*) from public.audit_events where action = 'ai.analysis_completed')`), "completed|1", "completion audit is accepted");

  assert.throws(() => asUser(`${setup}; select public.reserve_my_ai_usage('application_pack', repeat('f', 64), 9900)`), /ai_monthly_budget_exceeded/);
  assert.equal(last(`reset role; update public.ai_usage_events set status = 'completed', actual_hkd_cents = 9900 where id = (select id from u);
    set local role authenticated; select public.save_my_application_draft('${opp}', 'cover_letter', null, 'still works', null) is not null`), "t",
    "budget exhaustion does not block manual drafting");
  assert.throws(() => asUser(`${setup}; reset role; ${grants("off")}; set local role authenticated;
    select public.reserve_my_ai_usage('application_pack', repeat('a', 64), 100)`), /ai_permission_denied/);
  assert.throws(() => asUser(`${setup}; reset role;
    insert into public.privacy_locks (user_id, is_locked, locked_at) values ('${user}', true, now())
      on conflict (user_id) do update set is_locked = true, locked_at = now();
    set local role authenticated; select public.save_my_application_draft('${opp}', 'cover_letter', null, 'x', null)`), /privacy_locked/);
  assert.throws(() => asUser(`${setup}; insert into public.application_drafts (user_id, opportunity_id, field_key, body, source, locked)
    values ('${user}', '${opp}', 'gap_explanation', 'x', 'ai', false)`), /permission denied/);
});

test("resume upload: register_my_resume_version accepts a real storage path (regex fix)", { skip: !enabled && "set MFIN_TEST_PG=1 to run" }, () => {
  const version = "ae000000-0000-4000-8000-000000000001";
  const path = `${user}/${version}/resume.pdf`;
  const setup = `reset role;
    insert into public.permission_grants (user_id, capability_key, mode) values ('${user}', 'files.upload', 'persistent')
      on conflict (user_id, capability_key) do update set mode = 'persistent', active = true;
    insert into storage.objects (bucket_id, name) values ('resume-files', '${path}');
    set local role authenticated`;
  const call = (storagePath) => `select version_id from public.register_my_resume_version(
      target_version_id => '${version}', target_document_id => null, target_document_kind => 'master', target_label => 'Master',
      target_original_filename => 'cv.pdf', target_mime_type => 'application/pdf', target_storage_path => '${storagePath}',
      target_page_count => 1, target_content_sha256 => repeat('9', 64), target_size_bytes => 1000,
      target_extracted_character_count => 500, target_source_version_id => null)`;
  assert.equal(asUser(`${setup}; ${call(path)}`).split("\n").pop(), version, "a normal '<uid>/<version>/resume.pdf' path registers");
  assert.throws(() => asUser(`${setup}; ${call(`${user}/${version}/resume\\.pdf`)}`), /invalid_resume_version/, "a path with a backslash is still rejected");
  assert.throws(() => asUser(`${setup}; ${call(`${user}/${version}/other.pdf`)}`), /invalid_resume_version/);
});
