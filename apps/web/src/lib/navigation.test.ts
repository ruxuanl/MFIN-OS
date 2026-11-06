import { describe, expect, it } from "vitest";

import { isNavigationActive, mobileMoreHrefs, primaryNavigation, secondaryNavigation } from "./navigation";

describe("navigation contract", () => {
  it("keeps the four product domains as independent primary entries", () => {
    expect(primaryNavigation.map((item) => item.label)).toEqual(["今日行动", "实习", "秋招", "学业"]);
    expect(new Set(primaryNavigation.map((item) => item.href)).size).toBe(4);
  });

  it("keeps settings available without displacing the primary domains", () => {
    expect(secondaryNavigation.some((item) => item.href === "/settings")).toBe(true);
  });

  it("exposes every secondary destination through the mobile more entry", () => {
    expect(mobileMoreHrefs).toEqual(secondaryNavigation.map((item) => item.href));
    expect(mobileMoreHrefs).toContain("/calendar");
    expect(mobileMoreHrefs).toContain("/review");
    expect(mobileMoreHrefs).toContain("/status");
  });

  it("keeps more active while visiting a secondary destination", () => {
    expect(isNavigationActive("/review", "/more", mobileMoreHrefs)).toBe(true);
    expect(isNavigationActive("/calendar/conflicts", "/more", mobileMoreHrefs)).toBe(true);
    expect(isNavigationActive("/internships", "/more", mobileMoreHrefs)).toBe(false);
  });
});
