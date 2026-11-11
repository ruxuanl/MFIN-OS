import assert from "node:assert/strict";
import test from "node:test";

import { buildSeedData, buildSeedSql, buildUnseedSql, defaultCounts, seedId, sqlLiteral } from "../scripts/test-env/seed-data.mjs";

const data = buildSeedData();

test("seed has the planned volume", () => {
  assert.equal(data.opportunities.length, defaultCounts.opportunities);
  assert.equal(data.candidates.length, defaultCounts.candidates);
  assert.equal(data.gmailMessages.length, defaultCounts.gmailMessages);
  assert.equal(data.calendarEvents.length, defaultCounts.calendarEvents);
  assert.ok(data.opportunities.some((item) => item.track === "internship"));
  assert.ok(data.opportunities.some((item) => item.track === "graduate"));
});

test("seed is deterministic, so re-runs and cleanup target the same rows", () => {
  assert.deepEqual(buildSeedData(), data);
  assert.equal(seedId("opportunity", 0), data.opportunities[0].id);
  const ids = [data.connection, data.calendarSource, ...data.opportunities, ...data.candidates,
    ...data.gmailMessages, ...data.calendarEvents].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("seed contains no real-format e-mail addresses or phone numbers", () => {
  const sql = buildSeedSql(data);
  assert.doesNotMatch(sql, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, "no e-mail addresses anywhere");
  const freeText = [
    ...data.opportunities.flatMap((item) => [item.company, item.department, item.role_title, item.location, item.raw_jd,
      item.source_summary, item.requirements, item.application_method]),
    ...data.candidates.flatMap((item) => [item.company, item.role_title, item.source_summary]),
    ...data.gmailMessages.flatMap((mail) => [mail.sender_summary, mail.subject, mail.summary, mail.action_title]),
    ...data.calendarEvents.map((event) => event.summary)
  ].filter(Boolean).join("\n");
  assert.doesNotMatch(freeText, /\+?\d(?:[ -]?\d){7,}/, "no phone-number-like digit runs in free text");
  for (const item of data.opportunities) assert.match(item.source_url, /^https:\/\/[^/]+\.example\//);
});

test("rows respect the table constraints the database enforces", () => {
  for (const item of data.opportunities) {
    const applied = ["submitted", "test", "interview", "waiting", "offer", "ended"].includes(item.main_stage);
    assert.equal(item.applied_at !== null, applied, "applied_at only for submitted+ stages");
    assert.equal(item.close_reason !== null, item.main_stage === "ended", "close_reason only when ended");
    assert.ok(item.raw_jd.length >= 20 && item.raw_jd.length <= 50000);
    assert.ok(item.company.length <= 240 && item.role_title.length <= 240);
  }
  for (const mail of data.gmailMessages) {
    assert.equal(mail.action_title !== null, mail.needs_action);
    assert.match(mail.history_id, /^[0-9]+$/);
  }
  for (const event of data.calendarEvents) {
    if (event.all_day) assert.ok(event.starts_on < event.ends_on && event.starts_at === null);
    else assert.ok(event.starts_at < event.ends_at && event.starts_on === null);
  }
});

test("cleanup deletes only seed ids and the seed-created connection", () => {
  const sql = buildUnseedSql(data);
  assert.match(sql, new RegExp(data.opportunities[0].id));
  assert.match(sql, new RegExp(`external_connections where id = '${data.connection.id}'`));
  assert.doesNotMatch(sql, /delete from public\.\w+;/, "no unbounded delete");
  assert.doesNotMatch(sql, /where user_id/, "never deletes by user");
});

test("sql literals escape quotes", () => {
  assert.equal(sqlLiteral("O'Neil"), "'O''Neil'");
  assert.equal(sqlLiteral(null), "null");
  assert.equal(sqlLiteral([]), "'{}'::text[]");
});
