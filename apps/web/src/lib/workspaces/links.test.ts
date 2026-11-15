import { describe, expect, it } from "vitest";

import { pageHref, viewHref } from "./links";

describe("tracked workspace navigation", () => {
  it("keeps filtered pagination inside tracked opportunities", () => {
    const url = new URL(pageHref("/internships", { query: "香港 研究", stage: "interview", state: "archived", sort: "deadline" }, 2), "https://example.invalid");
    expect(Object.fromEntries(url.searchParams)).toEqual({ tab: "tracked", query: "香港 研究", stage: "interview", state: "archived", sort: "deadline", page: "2" });
  });

  it("retains tracked context when returning to the first page", () => {
    expect(pageHref("/graduate", { state: "active", sort: "updated" }, 1)).toBe("/graduate?tab=tracked");
  });

  it("opens saved filters in the tracked tab without treating data as URL syntax", () => {
    const view = { filters: { query: "A&B", stage: "preparation", state: "active" }, sort_spec: ["company"] };
    const url = new URL(viewHref("/internships", view), "https://example.invalid");
    expect(url.searchParams.get("tab")).toBe("tracked");
    expect(url.searchParams.get("query")).toBe("A&B");
    expect(url.searchParams.get("sort")).toBe("company");
  });
});
