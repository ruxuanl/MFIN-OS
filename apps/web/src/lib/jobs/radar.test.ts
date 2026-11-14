import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeJobUrl, parseRadarPreferences, radarDefaults, radarQuery, toRadarItems, visibleRadarItems } from "./radar-model";
import { searchInternships } from "./tavily";
vi.mock("server-only", () => ({}));
afterEach(() => vi.unstubAllEnvs());
describe("manual internship radar", () => {
  it("keeps requisition identities but drops tracking and anchors", () => {
    expect(normalizeJobUrl("https://jobs.example.com/job/123?utm_source=x&jobId=2#apply")).toBe("https://jobs.example.com/job/123?jobId=2");
    expect(normalizeJobUrl("https://jobs.example.com/job/124")).not.toBe(normalizeJobUrl("https://jobs.example.com/job/123"));
    for (const u of ["javascript:alert(1)", "https://127.0.0.1/a", "https://user:pass@example.com/a", "http://example.com"]) expect(normalizeJobUrl(u)).toBeNull();
  });
  it("does not send the profile to search and rejects contact fields", () => {
    const p = parseRadarPreferences({ ...radarDefaults, profile: "synthetic personal profile" });
    expect(radarQuery(p)).not.toContain(p.profile);
    expect(() => parseRadarPreferences({ ...p, keywords: "me@example.com" })).toThrow("invalid_conditions");
  });
  it("searches saved multiple directions and types as alternatives", () => {
    const query = radarQuery({ ...radarDefaults, direction: "equity research investment banking", internshipType: "off-cycle summer internship" });
    expect(query).toContain('("equity research" OR "investment banking")');
    expect(query).toContain('("off-cycle" OR "summer")');
  });
  it("hides non-recruiting articles and prioritizes actual finance internships", () => {
    const items = toRadarItems([
      {title:"Goldman Sachs Interview Experience & Questions",url:"https://example.com/Interview/questions",content:"Internship interview"},
      {title:"Bank internship roles",url:"https://example.com/list",content:"Recruitment list"},
      {title:"Food Technical Internship",url:"https://example.com/jobs/123",content:"Food intern"},
      {title:"MBA Credit Research Internship",url:"https://example.com/jobs/124",content:"Credit research"}
    ]);
    expect(items).toHaveLength(3);
    const sorted = visibleRadarItems(items);
    expect(sorted[0].title).toBe("MBA Credit Research Internship");
    expect(sorted[1].kind).toBe("unconfirmed");
    expect(items[0].title).toBe("Bank internship roles");
  });
  it("distinguishes listing, closed, explicit evidence and snippet-only results", () => {
    const items = toRadarItems([
      { title: "Research Intern", url: "https://careers.example.com/job/1", raw_content: "Company: Synthetic Capital\nLocation: Hong Kong\nDeadline: 2020-01-01" },
      { title: "100 internship jobs in Hong Kong", url: "https://example.com/jobs/search", content: "Some jobs" },
      { title: "Investment Intern", url: "https://example.com/job/2", content: "No longer accepting applications" },
      { title: "Investment Intern", url: "https://example.com/job/3", content: "Apply now" },
      { title: "Duplicate", url: "https://example.com/job/3?utm_campaign=x" }
    ]);
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ kind: "closed", company: "Synthetic Capital", location: "Hong Kong", deadline: "2020-01-01" });
    expect(items[1].kind).toBe("unconfirmed"); expect(items[2].kind).toBe("closed");
    expect(items[3]).toMatchObject({ kind: "job", evidenceKind: "snippet", deadline: null });
  });
  it("calls the fixed provider once with bounded request, never retries", async () => {
    vi.stubEnv("TAVILY_API_KEY", "synthetic-key");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] })));
    expect(await searchInternships(radarDefaults, fetcher)).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(JSON.parse(init.body)).toMatchObject({ max_results: 8, search_depth: "basic", auto_parameters: false });
    expect(init.body).not.toContain(radarDefaults.profile);
    fetcher.mockResolvedValue(new Response("secret upstream body", { status: 401 }));
    await expect(searchInternships(radarDefaults, fetcher)).rejects.toThrow("search_key_invalid");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("fails safely on missing config and network failures", async () => {
    vi.stubEnv("TAVILY_API_KEY", ""); const fetcher = vi.fn();
    await expect(searchInternships(radarDefaults, fetcher)).rejects.toThrow("search_not_configured");
    expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv("TAVILY_API_KEY", "synthetic-key"); fetcher.mockRejectedValue(new Error("secret"));
    await expect(searchInternships(radarDefaults, fetcher)).rejects.toThrow("search_unavailable");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
