import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fix = await readFile(new URL("../supabase/migrations/20261114090000_fix_resume_storage_path_regex.sql", import.meta.url), "utf8");

test("register_resume_version checks the storage path with a single-escaped dot", () => {
  const code = fix.replace(/--[^\n]*/g, "");
  assert.match(code, /create or replace function private\.register_resume_version\(/);
  assert.ok(code.includes("'/[0-9a-f-]{36}/resume\\.(pdf|docx)$'"), "regex must be resume\\.(pdf|docx)$");
  assert.ok(!code.includes("resume\\\\."), "a double backslash demands a literal backslash and rejects every real path");
});

test("the regex accepts real paths and rejects look-alikes (JS mirror of the POSIX pattern)", () => {
  const uid = "33333333-3333-4333-8333-333333333333";
  const re = new RegExp(`^${uid}/[0-9a-f-]{36}/resume\\.(pdf|docx)$`);
  assert.ok(re.test(`${uid}/ae000000-0000-4000-8000-000000000001/resume.pdf`));
  assert.ok(re.test(`${uid}/ae000000-0000-4000-8000-000000000001/resume.docx`));
  assert.ok(!re.test(`${uid}/ae000000-0000-4000-8000-000000000001/resumeXpdf`));
  assert.ok(!re.test(`${uid}/ae000000-0000-4000-8000-000000000001/other.pdf`));
});
