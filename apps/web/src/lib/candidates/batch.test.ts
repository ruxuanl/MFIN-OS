import { describe, expect, it } from "vitest";

import { errorLabel, parseBatchForm, summarize } from "./batch";

const a = "11111111-1111-4111-8111-111111111111";
const b = "22222222-2222-4222-8222-222222222222";

describe("parseBatchForm", () => {
  it("dedupes ids and drops non-uuids", () => {
    expect(parseBatchForm({ ids: [a, a, "x", b], decision: "later", reason: "" }))
      .toEqual({ ok: true, ids: [a, b], decision: "later", reason: null });
  });

  it("requires a selection, a known decision and a reason for dismissal", () => {
    expect(parseBatchForm({ ids: [], decision: "later", reason: "" }).ok).toBe(false);
    expect(parseBatchForm({ ids: [a], decision: "delete", reason: "" }).ok).toBe(false);
    expect(parseBatchForm({ ids: [a], decision: "dismissed", reason: " " }).ok).toBe(false);
    expect(parseBatchForm({ ids: [a], decision: "dismissed", reason: "地点不合适" }).ok).toBe(true);
  });

  it("caps the batch size", () => {
    const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    expect(parseBatchForm({ ids, decision: "later", reason: "" }).ok).toBe(false);
  });
});

describe("summaries", () => {
  it("reports per-outcome counts and readable errors", () => {
    expect(summarize([
      { candidateId: a, outcome: "updated", errorCode: null },
      { candidateId: b, outcome: "failed", errorCode: "candidate_not_found" }
    ])).toBe("完成 1 项，1 项失败。");
    expect(errorLabel("candidate_already_promoted")).toContain("长期表");
    expect(errorLabel("weird")).toContain("刷新");
  });
});
