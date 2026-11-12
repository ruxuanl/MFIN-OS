import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { describeFilters, hasFilters, parseQuestion, presetQuestions } from "./question";

type Gold = { questions: { id: string; question: string; filters: ReturnType<typeof parseQuestion> }[] };
const gold = JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../tests/fixtures/multihop-gold.json"), "utf8")) as Gold;

describe("multi-hop question parser", () => {
  it("parses the 20 gold questions with ≥ 80% exact accuracy", () => {
    const misses = gold.questions.filter((item) => JSON.stringify(parseQuestion(item.question)) !== JSON.stringify(item.filters));
    const accuracy = (gold.questions.length - misses.length) / gold.questions.length;
    expect(gold.questions).toHaveLength(20);
    expect(accuracy, `misses: ${misses.map((item) => `${item.id} ${item.question} -> ${JSON.stringify(parseQuestion(item.question))}`).join(" | ")}`).toBeGreaterThanOrEqual(0.8);
  });

  it("does not treat HR or R&D as the R language", () => {
    expect(parseQuestion("HR 已经回复了的投递").skills).toEqual([]);
    expect(parseQuestion("R&D 实习").skills).toEqual([]);
  });

  it("describes filters and recognises empty questions", () => {
    const filters = parseQuestion("投过、要求 Python、还没回复");
    expect(describeFilters(filters, (key) => key)).toEqual(["已投递", "要求 python", "未回复"]);
    expect(hasFilters(parseQuestion("你好"))).toBe(false);
    for (const preset of presetQuestions) expect(hasFilters(parseQuestion(preset))).toBe(true);
  });
});
