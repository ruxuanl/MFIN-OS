#!/usr/bin/env node
// Build one SQL file that bootstraps an EMPTY, isolated Test Supabase project (D33):
// all migrations in filename order, plus (optionally) the single-user signup allowlist.
//
// Usage:
//   node scripts/test-env/build-bootstrap-sql.mjs
//   MFIN_ALLOWED_EMAIL=you@example.com node scripts/test-env/build-bootstrap-sql.mjs
//
// Output: work/test-env/bootstrap.sql (git-ignored). Paste it into the Supabase SQL Editor
// of a NEW project, or run it with psql. The allowlisted email is written only as its
// SHA-256 digest, matching private.auth_signup_allowlist; the plain address never lands on disk.
import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationPattern = /^\d{14}_[a-z0-9_]+\.sql$/;

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function emailDigestHex(email) {
  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("MFIN_ALLOWED_EMAIL is not a valid email address.");
  }
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function allowlistStatement(digestHex) {
  if (!/^[0-9a-f]{64}$/.test(digestHex)) throw new Error("Digest must be 64 lowercase hex characters.");
  return [
    "-- Single-user signup allowlist (SHA-256 digest only).",
    "insert into private.auth_signup_allowlist (email_hash)",
    `values (decode('${digestHex}', 'hex'))`,
    "on conflict (singleton) do update set email_hash = excluded.email_hash;"
  ].join("\n");
}

export async function listMigrations(migrationsDir) {
  const names = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql"));
  const invalid = names.filter((name) => !migrationPattern.test(name));
  if (invalid.length > 0) throw new Error(`Unexpected migration file names: ${invalid.join(", ")}`);
  return names.sort();
}

export async function buildBootstrapSql({ migrationsDir, allowedEmail }) {
  const names = await listMigrations(migrationsDir);
  const parts = [
    "-- MFIN-OS Test environment bootstrap. Generated file: do not commit.",
    "-- Apply ONLY to an empty, isolated Test project (D33). Never to Production.",
    `-- Migrations: ${names.length}`,
    ""
  ];
  for (const name of names) {
    const sql = await readFile(path.join(migrationsDir, name), "utf8");
    parts.push(`-- >>> ${name}`, sql.trimEnd(), `-- <<< ${name}`, "");
  }
  if (allowedEmail) parts.push(allowlistStatement(emailDigestHex(allowedEmail)), "");
  return { sql: `${parts.join("\n")}\n`, count: names.length };
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
  const migrationsDir = path.join(root, "supabase", "migrations");
  const outDir = path.join(root, "work", "test-env");
  const allowedEmail = process.env.MFIN_ALLOWED_EMAIL?.trim() || undefined;

  const { sql, count } = await buildBootstrapSql({ migrationsDir, allowedEmail });
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "bootstrap.sql");
  await writeFile(outFile, sql, "utf8");

  console.log(`Wrote ${path.relative(root, outFile)} (${count} migrations, ${Math.round(sql.length / 1024)} KB).`);
  console.log(allowedEmail
    ? "Included the single-user allowlist digest."
    : "No MFIN_ALLOWED_EMAIL set: add the allowlist later (see docs/RUNBOOKS/test-environment.md).");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
