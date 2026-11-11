import { describe, expect, it } from "vitest";

import { formatSchedule, groupReportItems, isReportType, sectionLabels, strategyLabel } from "./model";

describe("report model", () => {
  it("accepts only the three product report types", () => {
    expect(isReportType("morning")).toBe(true);
    expect(isReportType("evening")).toBe(true);
    expect(isReportType("weekly")).toBe(true);
    expect(isReportType("instant")).toBe(false);
  });

  it("formats daily and weekly schedules honestly", () => {
    expect(formatSchedule({ report_type: "morning", local_time: "08:00:00", weekday: null, time_zone: "Asia/Hong_Kong" })).toContain("每天 08:00");
    expect(formatSchedule({ report_type: "weekly", local_time: "20:00:00", weekday: 7, time_zone: "Asia/Hong_Kong" })).toContain("每周日 20:00");
  });

  it("preserves the database section contract", () => {
    const grouped = groupReportItems([{ section: "focus", title: "A" }, { section: "risk", title: "B" }, { section: "focus", title: "C" }]);
    expect(grouped.get("focus")?.map((item) => item.title)).toEqual(["A", "C"]);
  });

  it("labels the rules_v2 strategy as non-AI and names the deadline section", () => {
    expect(strategyLabel("rules_v2")).toBe("规则排序 v2 · 非 AI");
    expect(strategyLabel(undefined)).toContain("非 AI");
    expect(sectionLabels.deadline).toBe("截止提醒");
  });
});
