#!/usr/bin/env node
// Run the search gold set against a throwaway local PostgreSQL (same harness as `pnpm test:db`).
// Usage: PGHOST=... PGPORT=... PGUSER=... node scripts/search-eval/run.mjs
// Creates database mfin_search_eval, applies every migration, loads the synthetic corpus, and
// prints recall@5 / MRR for search v1 and for the pre-#12 includes() baseline.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { baselineRanking, buildCorpusSql, buildQuerySql, evaluate, formatReport, parseRankings } from "./metrics.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const evalUser = "55555555-5555-4555-8555-555555555555";

export function runSearchEval({ db = "mfin_search_eval", applyMigrations = true } = {}) {
  const gold = JSON.parse(readFileSync(path.join(root, "tests", "fixtures", "search-gold.json"), "utf8"));
  const psql = (sql) => execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db, "-c", sql], { encoding: "utf8" }).trim();
  if (applyMigrations) execFileSync("bash", [path.join(root, "tests", "db", "apply-migrations.sh"), db], { stdio: "pipe" });
  psql(`insert into auth.users (id, email) values ('${evalUser}', 'search-eval@example.invalid') on conflict do nothing`);
  psql(`delete from public.opportunities where user_id = '${evalUser}'; delete from public.opportunity_candidates where user_id = '${evalUser}';
    delete from public.gmail_messages where user_id = '${evalUser}'; ${buildCorpusSql(gold, evalUser)}`);
  const output = psql(`begin; set local role authenticated;
    select set_config('request.jwt.claims', '{"sub":"${evalUser}","role":"authenticated"}', true) is null;
    ${buildQuerySql(gold)}; rollback;`);
  const v1 = evaluate(gold.queries, parseRankings(output, gold));
  const baseline = evaluate(gold.queries, Object.fromEntries(gold.queries.map((query) => [query.id, baselineRanking(gold.documents, query.query)])));
  return { gold, v1, baseline };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { v1, baseline } = runSearchEval();
  console.log(formatReport("search v1      ", v1));
  console.log(formatReport("baseline (old) ", baseline));
  const misses = v1.rows.filter((row) => row.recall < 1);
  if (misses.length) console.log(`v1 misses: ${misses.map((row) => `${row.id} "${row.query}" (${row.recall.toFixed(2)})`).join("; ")}`);
}
