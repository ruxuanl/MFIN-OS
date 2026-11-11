import { describe, expect, it } from "vitest";

import { buildChecklist, officialApplyUrl, recommendResume, suggestedStartDate, type ResumeOption } from "./package-rules";

describe("buildChecklist", () => {
  it("always includes the resume and the final self-check", () => {
    const keys = buildChecklist("").map((item) => item.key);
    expect(keys).toEqual(["cv", "final_review"]);
  });

  it("detects materials from English and Chinese JD text with evidence", () => {
    const items = buildChecklist("Please attach your cover letter and transcript. IELTS 7.0 preferred. 需完成在线测评，并提供推荐信。");
    const keys = items.map((item) => item.key);
    expect(keys).toEqual(expect.arrayContaining(["cover_letter", "transcript", "language", "online_assessment", "references"]));
    const transcript = items.find((item) => item.key === "transcript");
    expect(transcript?.source).toBe("jd_rule");
    expect(transcript?.evidence).toContain("transcript");
  });

  it("does not flag HR or R as a reference requirement", () => {
    const keys = buildChecklist("Report to HR. Skills: R, Python.").map((item) => item.key);
    expect(keys).not.toContain("references");
  });
});

describe("recommendResume", () => {
  const options: ResumeOption[] = [
    { id: "m1", versionNumber: 1, createdAt: "2026-09-01T00:00:00Z", documentKind: "master", label: "Master", archived: false },
    { id: "m2", versionNumber: 2, createdAt: "2026-10-01T00:00:00Z", documentKind: "master", label: "Master", archived: false },
    { id: "t1", versionNumber: 1, createdAt: "2026-10-05T00:00:00Z", documentKind: "tailored", label: "IBD", archived: false }
  ];

  it("prefers the version already assigned to this opportunity", () => {
    expect(recommendResume(options, "t1").versionId).toBe("t1");
  });

  it("falls back to the newest master and says so", () => {
    const result = recommendResume(options, null);
    expect(result.versionId).toBe("m2");
    expect(result.reason).toContain("Master");
  });

  it("explains when the library is empty", () => {
    expect(recommendResume([], null)).toEqual({ versionId: null, reason: expect.stringContaining("暂无简历") });
  });
});

describe("dates and links", () => {
  it("suggests a start date before the deadline but never in the past", () => {
    expect(suggestedStartDate("2026-12-20", "2026-11-12", 3)).toBe("2026-12-15");
    expect(suggestedStartDate("2026-11-13", "2026-11-12", 3)).toBe("2026-11-12");
    expect(suggestedStartDate(null, "2026-11-12", 3)).toBeNull();
  });

  it("only returns https links", () => {
    expect(officialApplyUrl("https://careers.example/1", null, null)).toBe("https://careers.example/1");
    expect(officialApplyUrl("http://insecure.example", "投递：https://jobs.example/apply。", null)).toBe("https://jobs.example/apply");
    expect(officialApplyUrl(null, "邮件投递", "no link")).toBeNull();
  });
});
