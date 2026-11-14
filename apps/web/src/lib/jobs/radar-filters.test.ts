import { describe, expect, it, vi, afterEach } from "vitest";
import { radarDefaults, parseRadarPreferences, radarQuery, radarDays, radarCategory, radarApplicationEmail, chineseRadarLocation, toRadarItems } from "./radar-model";
import { searchInternships } from "./tavily";
vi.mock("server-only", () => ({}));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("discovery filters and compact facts", () => {
  it("combines checked locations and sectors with OR and discards the old personal profile", () => {
    const p = parseRadarPreferences({ ...radarDefaults, direction: "二级买方,PEVC,投行", region: "北京,香港", publishedWithin: "1,3,7", profile: "old private profile" });
    expect(p.profile).not.toContain("private");
    expect(radarQuery(p)).toContain('("Beijing" OR "Hong Kong")');
    expect(radarQuery(p)).toContain('"private equity" OR "venture capital"');
    expect(radarQuery(p)).toContain('("off-cycle" OR "summer")');
    expect(radarDays(p)).toBe(7);
    expect(() => parseRadarPreferences({ ...p, publishedWithin: "30" })).toThrow();
    expect(() => parseRadarPreferences({ ...p, direction: "" })).toThrow();
  });
  it("requests a real date window without adding extra provider calls", async () => {
    vi.stubEnv("TAVILY_API_KEY", "synthetic");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-14T12:00:00Z"));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] })));
    await searchInternships({ ...radarDefaults, publishedWithin: "1,3" }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ start_date: "2026-11-11", include_published_date: true, topic: "general" });
  });
  it("keeps unknown publication dates unknown and only extracts application emails from evidence", () => {
    const items = toRadarItems([
      { title: "Private Equity Intern", url: "https://example.com/jobs/1", content: "Please send CV to careers@example.com", published_date: "2020-01-02" },
      { title: "Research Intern", url: "https://example.com/jobs/2", content: "Location: Hong Kong\nDeadline: 2020-01-03\nPrivacy: privacy@example.com" }
    ]);
    expect(items[0].publishedAt).toBe("2020-01-02");
    expect(items[1].publishedAt).toBeNull();
    expect(radarApplicationEmail(items[0])).toBe("careers@example.com");
    expect(radarApplicationEmail(items[1])).toBeNull();
    expect(chineseRadarLocation(items[1])).toBe("香港");
    expect(radarCategory(items[0])).toBe("PEVC");
    expect(radarCategory(items[1])).toBe("其他");
    expect(radarCategory({ ...items[1], category: "二级卖方" })).toBe("二级卖方");
  });
});
