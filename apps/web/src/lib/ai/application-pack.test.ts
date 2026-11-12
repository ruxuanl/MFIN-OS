import { describe, expect, it } from "vitest";

import {
  applicationPackSchema, buildPackPayload, fingerprintSource, packInstructions, packPayloadKeys,
  packReserveHkdCents, parseQuestions
} from "./application-pack";

const base = {
  company: "示例资本", roleTitle: "Analyst", jdText: "Responsibilities: research.",
  resumeVersionId: "11111111-1111-4111-8111-111111111111", resumeText: "Python, Excel", questions: ["Why us?"]
};
const pricing = { inputUsdPerMillion: 2, outputUsdPerMillion: 8, usdHkdRate: 7.8, reserveHkdCents: 50 };

describe("application pack payload whitelist", () => {
  it("contains only one JD, one confirmed resume version and the pasted questions", () => {
    const payload = buildPackPayload(base);
    expect(Object.keys(payload).sort()).toEqual([...packPayloadKeys].sort());
    expect(Object.keys(payload.jd).sort()).toEqual(["company", "roleTitle", "text"]);
    expect(Object.keys(payload.resume).sort()).toEqual(["text", "versionId"]);
    const prompt = packInstructions(payload);
    expect(prompt).toContain("Responsibilities: research.");
    expect(prompt).toContain("Why us?");
  });

  it("ignores any extra fields a caller tries to pass", () => {
    const payload = buildPackPayload({ ...base, email: "x@example.invalid", gmail: "inbox" } as typeof base);
    expect(JSON.stringify(payload)).not.toContain("example.invalid");
    expect(JSON.stringify(payload)).not.toContain("inbox");
  });

  it("requires a JD and resume text, and bounds sizes", () => {
    expect(() => buildPackPayload({ ...base, jdText: " " })).toThrow("pack_jd_required");
    expect(() => buildPackPayload({ ...base, resumeText: "" })).toThrow("pack_resume_text_required");
    expect(buildPackPayload({ ...base, questions: Array(9).fill("q") }).questions).toHaveLength(5);
  });
});

describe("questions, fingerprint and reservation", () => {
  it("parses pasted questions, stripping numbering", () => {
    expect(parseQuestions("1. Why us?\n\n- Tell us about a project\n3、为什么选择本行业")).toEqual(["Why us?", "Tell us about a project", "为什么选择本行业"]);
  });

  it("fingerprints identical inputs identically and different ones differently", () => {
    expect(fingerprintSource(buildPackPayload(base))).toBe(fingerprintSource(buildPackPayload({ ...base })));
    expect(fingerprintSource(buildPackPayload(base))).not.toBe(fingerprintSource(buildPackPayload({ ...base, questions: ["Other?"] })));
  });

  it("reserves at least the configured amount and covers the longest output", () => {
    const small = packReserveHkdCents(buildPackPayload(base), pricing);
    expect(small).toBeGreaterThanOrEqual(50);
    const expensive = packReserveHkdCents(buildPackPayload(base), { ...pricing, outputUsdPerMillion: 600, reserveHkdCents: 1 });
    expect(expensive).toBeGreaterThan(1800);
    expect(packReserveHkdCents(buildPackPayload(base), { ...pricing, outputUsdPerMillion: 1e6 })).toBe(10_000);
  });

  it("schema demands evidence and confidence on every field", () => {
    expect(applicationPackSchema.properties.coverLetter.required).toEqual(["text", "confidence", "evidence", "missingInfo"]);
    expect(applicationPackSchema.properties.answers.items.required).toContain("question");
  });
});
