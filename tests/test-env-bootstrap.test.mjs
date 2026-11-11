import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import test from "node:test";

import {
  allowlistStatement,
  buildBootstrapSql,
  emailDigestHex
} from "../scripts/test-env/build-bootstrap-sql.mjs";

const migrationsDir = "supabase/migrations";
const syntheticEmail = "  Test.User@Example.INVALID ";

test("bootstrap includes every migration exactly once, in filename order", async () => {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql")).sort();
  const { sql, count } = await buildBootstrapSql({ migrationsDir });
  assert.equal(count, names.length);
  const positions = names.map((name) => sql.indexOf(`-- >>> ${name}\n`));
  assert.ok(positions.every((position) => position >= 0), "every migration is present");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions, "migrations keep filename order");
  for (const name of names) assert.equal(sql.split(`-- >>> ${name}\n`).length, 2, `${name} appears once`);
});

test("allowlist digest matches the database hook normalization (lower + trim, UTF-8, SHA-256)", () => {
  const expected = createHash("sha256").update("test.user@example.invalid", "utf8").digest("hex");
  assert.equal(emailDigestHex(syntheticEmail), expected);
});

test("bootstrap never writes the plain allowlisted email", async () => {
  const { sql } = await buildBootstrapSql({ migrationsDir, allowedEmail: syntheticEmail });
  assert.doesNotMatch(sql, /test\.user@example\.invalid/i);
  assert.match(sql, /insert into private\.auth_signup_allowlist/);
  assert.match(sql, new RegExp(emailDigestHex(syntheticEmail)));
});

test("bootstrap without an email contains no allowlist insert", async () => {
  const { sql } = await buildBootstrapSql({ migrationsDir });
  assert.doesNotMatch(sql, /insert into private\.auth_signup_allowlist/);
});

test("invalid inputs are rejected", () => {
  assert.throws(() => emailDigestHex("not-an-email"));
  assert.throws(() => allowlistStatement("abc"));
});
