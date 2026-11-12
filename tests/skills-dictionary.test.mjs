import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/20261112170000_skills_dictionary.sql", import.meta.url), "utf8");
const dictionarySource = await readFile(new URL("../apps/web/src/lib/skills/dictionary.ts", import.meta.url), "utf8");
const searchPage = await readFile(new URL("../apps/web/src/app/(app)/search/page.tsx", import.meta.url), "utf8");

// Parsed from source text so this test runs on any Node 22 (no TypeScript loader needed).
const tsEntries = [...dictionarySource.matchAll(/\{ key: "([a-z_]+)", label: "([^"]+)", category: "([a-z]+)", aliases: \[([^\]]*)\] \}/g)]
  .map(([, key, label, category, aliases]) => ({ key, label, category, aliases: [...aliases.matchAll(/"([^"]*)"/g)].map((match) => match[1]) }));
const sqlEntries = [...migration.matchAll(/^ {2}\('([a-z_]+)', '([^']+)', '([a-z]+)', array\[([^\]]*)\], array\[/gm)]
  .map(([, key, label, category, aliases]) => ({ key, label, category, aliases: [...aliases.matchAll(/'([^']*)'/g)].map((match) => match[1]) }));

function aliasPattern(alias) {
  const value = alias.toLowerCase();
  if (!/[a-z]/.test(value)) return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guard = value.length === 1 ? "[^a-z0-9+#&]" : "[^a-z0-9+#]";
  return `(^|${guard})${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|${guard})`;
}

test("the SQL dictionary is identical to the TypeScript source of truth", () => {
  assert.ok(tsEntries.length >= 40, `parsed ${tsEntries.length} TypeScript entries`);
  assert.deepEqual(sqlEntries, tsEntries);
});

test("SQL patterns are the boundary-guarded form of each alias", () => {
  let checked = 0;
  for (const match of migration.matchAll(/^ {2}\('([a-z_]+)', '[^']+', '[a-z]+', array\[([^\]]*)\], array\[(.*)\]\)[,;]?$/gm)) {
    const aliases = [...match[2].matchAll(/'([^']*)'/g)].map((item) => item[1]);
    const patterns = [...match[3].matchAll(/'((?:[^']|'')*)'/g)].map((item) => item[1]);
    assert.deepEqual(patterns, aliases.map(aliasPattern), match[1]);
    checked += 1;
  }
  assert.equal(checked, tsEntries.length);
  const r = new RegExp(aliasPattern("r"));
  assert.equal(r.test("hr 面试"), false);
  assert.equal(r.test("r&d"), false);
  assert.equal(r.test("熟悉 r 或 python"), true);
});

test("tables are owner-read-only; resume text is private", () => {
  for (const table of ["opportunity_skills", "resume_version_skills", "companies"]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(migration, /revoke all on table public\.opportunity_skills, public\.resume_version_skills from public, anon, authenticated;/);
  assert.match(migration, /create table private\.resume_version_texts/);
  assert.match(migration, /revoke all on table private\.resume_version_texts from public, anon, authenticated;/);
  assert.doesNotMatch(migration, /grant [^;]*private\.resume_version_texts[^;]* to authenticated/);
});

test("user edits are locked; re-extraction only replaces unlocked rule rows", () => {
  assert.match(migration, /delete from public\.opportunity_skills s where s\.opportunity_id = o\.id and s\.source = 'rule' and not s\.locked;/);
  assert.match(migration, /on conflict \(opportunity_id, skill_key\) do nothing;/);
  assert.match(migration, /source = 'user', locked = true/);
  assert.match(migration, /check \(source = 'rule' or locked\)/);
});

test("no AI, no graph database, no outbound calls; definer code avoids temp tables", () => {
  const code = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(code, /net\.http_|openai|create extension (age|pggraph)/i);
  assert.doesNotMatch(code, /create temp/i);
  assert.match(searchPage, /规则解析（非 AI）/);
});
