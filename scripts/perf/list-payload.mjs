#!/usr/bin/env node
// Compare the JSON payload of the opportunity list query before and after #10, using the
// synthetic seed (200 opportunities). Before: select("*") on every row of the track,
// archived included. After: list columns only, one page of 50 active rows.
import { buildSeedData } from "../test-env/seed-data.mjs";

const listColumns = ["id", "track", "company", "role_title", "department", "location", "main_stage", "substage",
  "deadline", "applied_at", "record_state", "updated_at"];
const now = "2026-11-12T00:00:00.000Z";
const user = "00000000-0000-4000-8000-000000000000";

const rows = buildSeedData().opportunities.map((row) => ({
  ...row, user_id: user, candidate_id: null, substage: null, version: 1, created_at: now, updated_at: now
}));

function bytes(value) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function measure(track = "internship") {
  const trackRows = rows.filter((row) => row.track === track);
  const before = trackRows;
  const after = trackRows.filter((row) => row.record_state === "active").slice(0, 50)
    .map((row) => Object.fromEntries(listColumns.map((column) => [column, row[column] ?? null])));
  return { track, beforeRows: before.length, beforeBytes: bytes(before), afterRows: after.length, afterBytes: bytes(after) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const track of ["internship", "graduate"]) {
    const result = measure(track);
    console.log(`${track}: before ${result.beforeRows} rows ${(result.beforeBytes / 1024).toFixed(1)} KB -> `
      + `after ${result.afterRows} rows ${(result.afterBytes / 1024).toFixed(1)} KB `
      + `(${Math.round((result.afterBytes / result.beforeBytes) * 100)}%)`);
  }
}
