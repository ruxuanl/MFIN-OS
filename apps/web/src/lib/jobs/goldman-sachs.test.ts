import { describe, expect, it, vi } from "vitest";

import {
  GOLDMAN_SACHS_QUERY_FINGERPRINT,
  parseGoldmanSachsPages,
  runGoldmanSachsDiscovery
} from "./goldman-sachs";

const offCycle = "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/off-cycle-internship-program";
const summer = "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/summer-analyst";
const graduate = "https://www.goldmansachs.com/careers/students/programs-and-internships/asia-pacific/new-analyst";

describe("goldman_sachs_public_programs_v1", () => {
  it("creates only explicitly open D14 target divisions", () => {
    const pages = new Map([
      [offCycle, `<main>Applications for our programs are currently open for Global Investment Research and Investment Banking. We review applications on a rolling basis. Our Off-Cycle Internships are 3 –12 month programs.</main>`],
      [summer, "<main>2027 Summer Analyst Program</main>"],
      [graduate, "<main>2027 New Analyst Program</main>"]
    ]);
    const result = parseGoldmanSachsPages(pages);
    expect(result.items).toHaveLength(2);
    expect(result.items.map((item) => item.department)).toEqual([
      "Global Investment Research",
      "Investment Banking"
    ]);
    expect(result.items.every((item) => item.track === "internship" && item.location === null)).toBe(true);
    expect(result.coverageGap).toContain("official_application_portal_robots_disallowed");
    expect(result.queryFingerprint).toBe(GOLDMAN_SACHS_QUERY_FINGERPRINT);
  });

  it("does not turn generic or closed programs into candidates", () => {
    const result = parseGoldmanSachsPages(new Map([
      [offCycle, "<main>Applications are currently closed.</main>"],
      [summer, "<main>Summer Analyst includes several unspecified divisions.</main>"],
      [graduate, "<main>New Analyst includes several unspecified divisions.</main>"]
    ]));
    expect(result.items).toEqual([]);
    expect(result.coverageGap).toContain("off_cycle_target_divisions_not_confirmed_open");
  });

  it("uses only fixed HTTPS Goldman Sachs pages and reports partial fetch coverage", async () => {
    const fetcher = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("summer-analyst")) return new Response("unavailable", { status: 503 });
      return new Response(
        url.endsWith("off-cycle-internship-program")
          ? "Applications for our programs are currently open for Global Investment Research and Investment Banking. We review applications on a rolling basis."
          : "New Analyst Program",
        { status: 200, headers: { "content-type": "text/html; charset=utf-8" } }
      );
    });
    const result = await runGoldmanSachsDiscovery(fetcher as typeof fetch);
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher.mock.calls.every(([url]) => new URL(String(url)).hostname === "www.goldmansachs.com")).toBe(true);
    expect(result.pagesVerified).toBe(2);
    expect(result.coverageGap).toContain("official_pages_unavailable:summer-analyst");
  });

  it("rejects a declared response above the bounded page size", async () => {
    const fetcher = vi.fn(async () => new Response("small body", {
      status: 200,
      headers: { "content-type": "text/html", "content-length": "750001" }
    }));
    await expect(runGoldmanSachsDiscovery(fetcher as typeof fetch))
      .rejects.toThrow("all_official_pages_unavailable");
  });
});
