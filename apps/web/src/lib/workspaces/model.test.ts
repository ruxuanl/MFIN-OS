import { describe, expect, it } from "vitest";

import { getMutationOutcomeLabel, normalizeFormPatch, stageLabels } from "./model";

describe("workspace domain model", () => {
  it("keeps the fixed opportunity stage semantics", () => {
    expect(Object.values(stageLabels)).toEqual([
      "新发现",
      "评估",
      "准备",
      "已投递",
      "测试",
      "面试",
      "等待",
      "Offer",
      "结束"
    ]);
  });

  it("normalizes empty optional form values to null", () => {
    expect(
      normalizeFormPatch(
        { title: "  Analyst  ", substage: " " },
        new Set(["substage"])
      )
    ).toEqual({ title: "Analyst", substage: null });
  });

  it("explains partial and conflicting sync outcomes", () => {
    expect(
      getMutationOutcomeLabel({ status: "partial", newVersion: 3, appliedFields: ["location"], conflictCount: 1 })
    ).toContain("未冲突字段");
    expect(
      getMutationOutcomeLabel({ status: "conflict", newVersion: 3, appliedFields: [], conflictCount: 1 })
    ).toContain("同字段冲突");
  });
});
