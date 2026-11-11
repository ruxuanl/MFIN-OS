#!/usr/bin/env node
// Write work/test-env/seed.sql and work/test-env/unseed.sql (both git-ignored).
// Run seed.sql in the SQL Editor (or psql) of your isolated Test project after you
// have signed in once; run unseed.sql to remove exactly the rows it created.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildSeedData, buildSeedSql, buildUnseedSql } from "./seed-data.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "work", "test-env");
const data = buildSeedData();
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "seed.sql"), buildSeedSql(data), "utf8");
await writeFile(path.join(outDir, "unseed.sql"), buildUnseedSql(data), "utf8");
console.log(`Wrote work/test-env/seed.sql and unseed.sql: ${data.opportunities.length} opportunities, `
  + `${data.candidates.length} candidates, ${data.gmailMessages.length} Gmail projections, `
  + `${data.calendarEvents.length} calendar events.`);
