import { describe, expect, it } from "vitest";

import { hasCriteria, parseSearchParams, resultHref } from "./params";

describe("parseSearchParams", () => {
  it("keeps valid values and drops unknown ones", () => {
    const params = parseSearchParams({ q: " 投行 ", type: ["opportunity", "bogus"], track: "graduate", stage: "submitted",
      from: "2026-11-01", to: "not-a-date" });
    expect(params).toMatchObject({ query: "投行", types: ["opportunity"], track: "graduate", stage: "submitted",
      deadlineFrom: "2026-11-01", deadlineTo: null });
  });

  it("bounds query length and treats an empty form as no search", () => {
    expect(parseSearchParams({ q: "x".repeat(500) }).query).toHaveLength(200);
    expect(hasCriteria(parseSearchParams({}))).toBe(false);
  });
});

describe("resultHref", () => {
  it("links each object type to where it lives", () => {
    expect(resultHref({ object_type: "opportunity", object_id: "abc", track: "graduate" })).toBe("/graduate/abc");
    expect(resultHref({ object_type: "candidate", object_id: "abc", track: "internship" })).toBe("/internships");
    expect(resultHref({ object_type: "gmail_message", object_id: "abc", track: null })).toBe("/inbox");
  });
});
