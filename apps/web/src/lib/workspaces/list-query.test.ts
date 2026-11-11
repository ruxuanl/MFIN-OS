import { describe, expect, it } from "vitest";

import { toIlikePattern } from "./list-query";

describe("toIlikePattern", () => {
  it("wraps plain text and strips PostgREST and LIKE syntax", () => {
    expect(toIlikePattern("Contoso")).toBe("%Contoso%");
    expect(toIlikePattern("a,b(c)%_*")).toBe("%a b c%");
    expect(toIlikePattern("   ")).toBeNull();
    expect(toIlikePattern(undefined)).toBeNull();
  });

  it("caps very long input", () => {
    expect(toIlikePattern("x".repeat(500))?.length).toBe(82);
  });
});
