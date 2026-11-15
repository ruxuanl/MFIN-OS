import { describe, expect, it } from "vitest";
import { radarDefaults, radarDirections, radarRegions, radarQuery, toRadarItems, type RadarItem } from "./radar-model";
import { filteredRadarItems, matchesRadarPreferences, radarHeadline, radarItemType } from "./radar-results";

const all = { ...radarDefaults, direction: radarDirections.join(","), region: radarRegions.join(","), internshipType: "日常,暑期" };
const now = new Date("2026-11-15T02:00:00Z");
const job = (overrides: Partial<RadarItem> = {}): RadarItem => ({
  url: "https://example.com/jobs/123", title: "Research Intern at Synthetic Capital", company: "Synthetic Capital", location: "Hong Kong",
  deadline: null, evidence: "Company: Synthetic Capital\nLocation: Hong Kong", evidenceKind: "snippet", kind: "job", category: "二级买方", reason: "", warning: "", ...overrides
});

describe("radar result regressions", () => {
  it("all types includes ordinary, daily and summer internships without forcing seasonal keywords", () => {
    const items = [job(), job({ title: "Off-cycle Research Intern at Synthetic Capital" }), job({ title: "Summer Research Intern at Synthetic Capital" })];
    expect(filteredRadarItems(items, all, now)).toHaveLength(3);
    expect(radarQuery(all)).not.toMatch(/summer|off-cycle/i);
    expect(radarQuery({ ...all, internshipType: "日常" })).toContain('"日常实习"');
    expect(radarQuery({ ...all, internshipType: "暑期" })).toContain('"暑期实习"');
  });
  it("single type excludes explicit mismatches and does not mistake related jobs for this job", () => {
    const summer = job({ title: "Summer Research Intern at Synthetic Capital" });
    const daily = job({ title: "Part-time Research Intern at Synthetic Capital", evidence: "Related jobs: Summer Intern in London" });
    expect(radarItemType(daily)).toBe("日常");
    expect(matchesRadarPreferences(summer, { ...all, internshipType: "日常" }, now)).toBe(false);
    expect(matchesRadarPreferences(daily, { ...all, internshipType: "暑期" }, now)).toBe(false);
  });
  it.each(["Canada", "Montreal, Quebec, Canada", "加拿大魁北克省蒙特利尔", "London", "New York"])("excludes %s even when all Asian regions are selected", location => {
    expect(filteredRadarItems([job({ location, locationZh: location })], all, now)).toEqual([]);
  });
  it("uses the source title over an incorrect AI location and ignores footer locations", () => {
    expect(matchesRadarPreferences(job({ title: "Research Intern at Scotiabank — Montreal, Canada", locationZh: "香港" }), all, now)).toBe(false);
    expect(matchesRadarPreferences(job({ evidence: "Headquarters in Canada. Similar jobs in London." }), { ...all, region: "香港" }, now)).toBe(true);
  });
  it("enforces specific and other Asian regions consistently", () => {
    const items = [job(), job({ location: "Shanghai" }), job({ location: "Singapore" })];
    expect(filteredRadarItems(items, { ...all, region: "香港" }, now)).toHaveLength(1);
    expect(filteredRadarItems(items, { ...all, region: "其他" }, now)).toHaveLength(1);
    expect(filteredRadarItems(items, { ...all, region: "香港,上海" }, now)).toHaveLength(2);
  });
  it("filters sectors and known old publication dates; missing dates remain unknown", () => {
    const items = [job(), job({ category: "PEVC" }), job({ publishedAt: "2026-10-01" })];
    expect(filteredRadarItems(items, { ...all, direction: "PEVC" }, now)).toHaveLength(1);
    expect(filteredRadarItems(items, all, now)).toHaveLength(2);
  });
  it("removes the Beijing events page, listing pages, non-intern roles and AI-rejected pages", () => {
    const invalid = [job({ title: "List of All Events Beijing China", url: "https://ilikevents.com/events/beijing" }),
      job({ title: "Wealth Talent Jobs in Hong Kong SAR" }), job({ title: "Equity Research Director at Synthetic Capital" }),
      job({ isRecruiting: false, summary: "北京全部活动列表网页，非招聘岗位" })];
    expect(filteredRadarItems(invalid, all, now)).toEqual([]);
    expect(toRadarItems([{ title: invalid[0].title, url: invalid[0].url, content: "Job Opportunities" }])).toEqual([]);
    const genuine = job({ title: "2027 Summer Research Internship at Synthetic Capital — Hong Kong | LinkedIn Jobs" });
    expect(filteredRadarItems([genuine], all, now)).toHaveLength(1);
  });
  it("builds a concrete Chinese company-and-role sentence from old evidence without AI", () => {
    const item = job({ title: "2027 MBA Summer Internship PM - Public - Credit ...", company: "未知／待核实",
      url: "https://hk.linkedin.com/jobs/view/2027-mba-summer-internship-pm-public-credit-research-apac-at-pimco-4460950191", evidence: "PIMCO is hiring for its Credit Research team." });
    expect(radarHeadline(item)).toBe("PIMCO招聘工商管理硕士暑期信用研究实习生。");
    expect(radarHeadline(job({ company: "未知／待核实", title: "Research Intern", evidence: "Company not disclosed" }))).toBeNull();
    expect(radarHeadline(job({ summary: "岗位中文摘要尚未生成，请查看原岗位说明核实。" }))).toBe("Synthetic Capital招聘研究实习生。");
  });
  it("keeps current valid summaries and does not overwrite source fields or user decisions", () => {
    const item = job({ summary: "Synthetic Capital香港研究实习，协助行业分析", status: "added" });
    const original = structuredClone(item);
    expect(radarHeadline(item)).toBe("Synthetic Capital香港研究实习，协助行业分析。");
    expect(filteredRadarItems([item], all, now)).toHaveLength(1);
    expect(item).toEqual(original);
  });
  it("retains Chinese internship titles with the employer already in the title, without waiting for AI", () => {
    for (const title of ["国泰海通证券-投资银行部实习生招聘（日常实习）", "华泰证券研究所行业研究日常实习生", "中金公司投行部日常实习生"]) {
      const item = job({ title, company: "未知／待核实", summary: undefined });
      expect(radarHeadline(item)).toContain(title.includes("国泰海通") ? "国泰海通证券" : title.includes("华泰") ? "华泰证券" : "中金公司");
      expect(filteredRadarItems([item], { ...all, internshipType: "日常" }, now)).toHaveLength(1);
    }
    expect(radarHeadline(job({ title: "平安证券实习生招聘", company: "未知／待核实" }))).toBeNull();
  });
  it("rejects the actual medical-writing false positive even when AI says recruiting and other is selected", () => {
    const clinical = job({ title: "【武汉 医学写作实习生 Medical Writer Intern招聘】-Caidya武汉招聘信息-猎聘", company: "Caidya", category: "其他", isRecruiting: true,
      summary: "Caidya招聘医学写作实习生，支持临床文档写作" });
    expect(filteredRadarItems([clinical], all, now)).toEqual([]);
    expect(toRadarItems([{ title: clinical.title, url: clinical.url, content: clinical.summary }])).toEqual([]);
    const healthcareInvestment = job({ title: "腾讯投资-投资分析市场实习生（AI方向、医药方向）", company: "腾讯投资", category: "PEVC", isRecruiting: true });
    expect(filteredRadarItems([healthcareInvestment], all, now)).toHaveLength(1);
    const pharmaceuticalFinance = job({ title: "医药集团财务实习生", company: "医药集团", category: "其他" });
    expect(filteredRadarItems([pharmaceuticalFinance], all, now)).toHaveLength(1);
  });
});
