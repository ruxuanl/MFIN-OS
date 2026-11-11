import { describe, expect, it } from "vitest";

import { isLinkDecision, linkRuleLabel, opportunityHref } from "./link-model";

describe("link model", () => {
  it("accepts only the three user decisions", () => {
    expect(isLinkDecision("confirm")).toBe(true);
    expect(isLinkDecision("unlink")).toBe(true);
    expect(isLinkDecision("auto")).toBe(false);
  });

  it("labels rules and builds opportunity links", () => {
    expect(linkRuleLabel("sender_domain")).toContain("域名");
    expect(linkRuleLabel("other")).toBe("other");
    expect(opportunityHref("graduate", "x")).toBe("/graduate/x");
    expect(opportunityHref("internship", "x")).toBe("/internships/x");
  });
});
