import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { baselineRanking, buildCorpusSql, evaluate, goldId, recallAtK, reciprocalRank } from "../scripts/search-eval/metrics.mjs";

const gold = JSON.parse(await readFile(new URL("./fixtures/search-gold.json", import.meta.url), "utf8"));

test("gold set has 40 queries split 15 zh / 15 en / 10 mixed, all pointing at known documents", () => {
  assert.equal(gold.queries.length, 40);
  const count = (lang) => gold.queries.filter((query) => query.lang === lang).length;
  assert.deepEqual([count("zh"), count("en"), count("mixed")], [15, 15, 10]);
  const keys = new Set(gold.documents.map((doc) => doc.key));
  for (const query of gold.queries) {
    assert.ok(query.relevant.length > 0, query.id);
    for (const key of query.relevant) assert.ok(keys.has(key), `${query.id} -> ${key}`);
  }
  assert.equal(new Set(gold.queries.map((query) => query.id)).size, 40);
});

test("the corpus is synthetic: no real e-mail addresses or phone numbers", () => {
  const text = JSON.stringify(gold.documents);
  assert.doesNotMatch(text, /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  assert.doesNotMatch(text, /\+?\d[\d -]{7,}\d/);
});

test("metrics", () => {
  assert.equal(recallAtK(["a", "b", "c"], ["c", "z"], 5), 0.5);
  assert.equal(recallAtK(["a", "b", "c", "d", "e", "f"], ["f"], 5), 0);
  assert.equal(reciprocalRank(["a", "b", "c"], ["c"]), 1 / 3);
  assert.equal(reciprocalRank([], ["c"]), 0);
  const result = evaluate([{ id: "q1", lang: "zh", query: "x", relevant: ["a"] }], { q1: ["a"] });
  assert.equal(result.recallAt5, 1);
  assert.equal(result.byLang.zh.mrr, 1);
});

test("baseline reproduces the pre-#12 opportunity-only includes() filter", () => {
  assert.deepEqual(baselineRanking(gold.documents, "Summer Analyst"), ["o1", "o12"]);
  assert.deepEqual(baselineRanking(gold.documents, "面试邀请"), [], "e-mail was not searchable before #12");
  assert.deepEqual(baselineRanking(gold.documents, "Python 量化"), [], "multi-word queries needed an exact substring");
});

test("corpus SQL uses deterministic ids and escapes quotes", () => {
  assert.equal(goldId("o1"), goldId("o1"));
  assert.notEqual(goldId("o1"), goldId("o2"));
  const sql = buildCorpusSql({ documents: [{ key: "x", type: "candidate", track: "internship", company: "O'Brien", role_title: "r", location: null, source_summary: null }] }, "u");
  assert.match(sql, /'O''Brien'/);
});
