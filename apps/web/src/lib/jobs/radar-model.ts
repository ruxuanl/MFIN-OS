import { parseInternshipJd } from "@/lib/internships/jd-parser";
import { parseRadarSourceTime, type RadarSourceTime } from "./radar-source-time";
import type { RadarSource } from "./radar-sources";
import { radarJobLocation } from "./radar-location";
export type RadarPreferences = { direction: string; region: string; keywords: string; internshipType: string; profile: string; publishedWithin?: string; source?: RadarSource };
export type RadarItem = {
  url: string; title: string; company: string; location: string; deadline: string | null;
  evidence: string; evidenceKind: "page_text" | "snippet"; kind: "job" | "unconfirmed" | "closed";
  isRecruiting?: boolean; summary?: string; jdSummary?: string; category?: string; locationZh?: string; publishedAt?: string | null;
  sourceTime?: RadarSourceTime | null; sourceObservedAt?: string;
  localSource?: { fileName: string; sheet: string; row: number; key: string; publicUrl: string | null };
  sourceLocation?: { value:string; reference:string; observedAt:string };
  reason: string; warning: string; status?: "pending" | "added" | "ignored";
};
export type RadarSnapshot = { preferences?: RadarPreferences; items: RadarItem[]; localItems?: RadarItem[]; localStats?: {files:number;records:number;available:boolean;message?:string}; runs: { id: string; status: string; created_at: string; error: string | null }[] };
export const radarDefaults: RadarPreferences = {
  direction: "二级买方,二级卖方,投行", region: "香港", keywords: "",
  internshipType: "日常,暑期", publishedWithin: "7",
  profile: "仅使用公开岗位条件，不使用个人画像。"
};
export function parseRadarPreferences(input: Record<string, unknown>): RadarPreferences {
  const output = {} as RadarPreferences;
  for (const key of ["direction", "region", "keywords", "internshipType", "profile"] as const) {
    const value = key === "profile" ? radarDefaults.profile : input[key];
    if (typeof value !== "string" || value.length > (key === "profile" ? 600 : 120)) throw new Error("invalid_conditions");
    output[key] = value.trim();
  }
  if (!output.direction || !output.region || !output.internshipType || !output.profile) throw new Error("invalid_conditions");
  // Search fields are public job conditions, never a CV/contact payload.
  if (/[\w.+-]+@[\w.-]+|https?:|\b\d{8,}\b/u.test([output.direction, output.region, output.keywords, output.internshipType].join(" "))) throw new Error("invalid_conditions");
  const days = input.publishedWithin ?? "7";
  if (typeof days !== "string" || !/^(?:1|3|7)(?:,(?:1|3|7))*$/.test(days)) throw new Error("invalid_conditions");
  output.publishedWithin = days;
  const source = input.source ?? "all";
  if (source !== "all" && source !== "boards" && source !== "wechat" && source !== "local") throw new Error("invalid_conditions");
  output.source = source;
  return output;
}
export function radarQuery(p: RadarPreferences) {
  // Mainland daily placements are advertised in Chinese. A long English OR
  // query was returning international career homepages instead of these posts.
  const mainland = /北京|深圳|上海/.test(p.region);
  if (mainland) {
    const directions: Record<string, string> = { 二级买方: "基金投研", 二级卖方: "证券研究", PEVC: "私募股权 创投", 投行: "投资银行", 其他: "金融" };
    const sector = radarDirections.every(x => p.direction.split(",").includes(x)) ? "(金融 OR 投资 OR 研究)" : p.direction.split(",").map(x => directions[x] ?? x).join(" ");
    const region = '(' + p.region.split(",").map(x => x === "其他" ? "亚洲" : x).join(" OR ") + ')';
    const type = p.internshipType === "日常" ? '"日常实习"' : p.internshipType === "暑期" ? '"暑期实习"' : "实习生";
    return `${type} 岗位职责 ${sector} ${region} ${p.keywords} -面经 -指南 -活动`.trim();
  }
  // The old saved defaults contain several alternatives. Requiring every term
  // favors generic career indexes instead of individual requisitions.
  const alternatives = (value: string, pattern: RegExp) => {
    const matches = [...new Set(value.match(pattern)?.map(x => x.toLowerCase()) ?? [])];
    return matches.length > 1 ? `(${matches.map(x => `"${x}"`).join(" OR ")})` : value;
  };
  const direction = p.direction.includes(",") || radarDirections.includes(p.direction) ? expandChoices(p.direction, directionSearch) : alternatives(p.direction, /equity research|investment banking|credit research|asset management|buy.side research|sell.side research/gi);
  // All types means no seasonal restriction: ordinary internships need not say
  // off-cycle, and a single mixed query must not require a summer keyword.
  const selectedTypes = p.internshipType.split(",");
  const type = radarTypes.every(x => selectedTypes.includes(x)) ? ""
    : p.internshipType === "日常" ? '("off-cycle" OR "part-time" OR "日常实习" OR "实习生")'
    : p.internshipType === "暑期" ? '("summer" OR "暑期")'
    : alternatives(p.internshipType, /off-cycle|summer|part-time|winter/gi);
  const regions = radarRegions.every(x => p.region.split(",").includes(x)) ? '(China OR "Hong Kong" OR Asia)' : expandChoices(p.region, regionSearch);
  const sectors = radarDirections.every(x => p.direction.split(",").includes(x)) ? '(finance OR investment OR research)' : direction;
  return `${regions} ${sectors} ${type} ${p.keywords} (internship OR intern OR 实习) -insurance -"wealth advisor"`.replace(/\s+/g, " ").trim();
}
export function normalizeJobUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password || u.port || !u.hostname.includes(".")
      || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)
      || /\.(local|internal)$/.test(u.hostname) || u.hostname.includes(":")) return null;
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.toString().replace(/\/$/, "");
  } catch { return null; }
}
export function isNonRecruitingPage(item: Pick<RadarItem, "title" | "url">) {
  return /\/(?:forum|reel|interview|events)\//i.test(item.url)
    || /interview experience|interview questions|coaches,? events|coaches.*resources|面试经验|面经|论坛讨论|list of .*events|活动列表|search results|jobs in|^\s*[\d,]+\+\s+.*\bjobs\b|\b[\d,]+\s+(?:jobs|vacancies)\b|招聘列表|职位列表/i.test(item.title);
}
export function isNonFinancialRole(item: Pick<RadarItem, "title">) {
  // A healthcare investment analyst is a finance role. A medical writer or
  // clinical research intern is not, even when the model labels it “其他”.
  const finance = /投资|投研|行研|行业研究|证券研究|财务|金融|量化|审计|investment|financial|finance|quant|equity research|credit research/i.test(item.title);
  return !finance && /医学写作|医疗写作|临床(?:研究|试验|医学|监查)|医药研发|药物研发|护理|护士|药师|医学检验|生物实验|食品技术|食品研发|medical writ(?:er|ing)|clinical (?:research|trial|monitor)|food technical/i.test(item.title);
}
export function visibleRadarItems<T extends RadarItem>(items: T[]): T[] {
  const rank = (item: RadarItem) => item.kind === "closed" ? 3 : item.kind !== "job" ? 1
    : /research|credit|bank|investment|financ|analyst|实习.*研究|研究|投行/i.test(item.title) ? 0 : 2;
  return items.filter(item => item.isRecruiting !== false && item.status !== "ignored" && !isNonRecruitingPage(item) && !isNonFinancialRole(item)).sort((a,b) => rank(a)-rank(b));
}
export function toRadarItems(results: unknown): RadarItem[] {
  if (!Array.isArray(results)) throw new Error("search_invalid_response");
  const seen = new Set<string>();
  const items: RadarItem[] = [];
  for (const entry of results.slice(0, 20)) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const url = typeof r.url === "string" ? normalizeJobUrl(r.url) : null;
    if (!url || url.length > 2048 || seen.has(url) || typeof r.title !== "string") continue;
    seen.add(url);
    const pageText = typeof r.raw_content === "string" ? r.raw_content.trim() : "";
    const evidence = (pageText || (typeof r.content === "string" ? r.content : "")).slice(0, 6000);
    const title = r.title.slice(0, 240);
    if (isNonRecruitingPage({ title, url }) || isNonFinancialRole({ title })) continue;
    const closed = /no longer accepting|position (?:has been )?filled|job (?:has )?expired|applications? (?:are )?closed|已截止|停止招聘/i.test(evidence);
    const job = /\bintern(?:ship)?s?\b|实习/i.test(title) && /\/(?:job|jobs|requisition|position|vacancy|view)\/[^/?]+|[?&](?:jobid|job_id|gh_jid)=/i.test(url)
      && !/\b\d+\+?\s+(?:jobs|internships)|jobs in|search results|招聘列表/i.test(title);
    const explicitCompany = evidence.match(/(?:^|\n)(?:公司|公司名称|company|employer)\s*[:：]\s*([^\n]{1,240})/i)?.[1]?.trim();
    const explicitLocation = evidence.match(/(?:^|\n)(?:地点|工作地点|location)\s*[:：]\s*([^\n]{1,240})/i)?.[1]?.trim();
    const deadline = pageText ? parseInternshipJd(pageText.slice(0, 6000)).deadline : null;
    const expired = deadline ? deadline < new Date().toISOString().slice(0, 10) : false;
    const sourceTime = parseRadarSourceTime(r.published_date, evidence);
    items.push({ url, title, company: explicitCompany ?? "未知／待核实", location: explicitLocation ?? "未知／待核实", deadline,
      publishedAt: sourceTime?.to ?? null, sourceTime, sourceObservedAt: new Date().toISOString(),
      evidence, evidenceKind: pageText ? "page_text" : "snippet", kind: closed || expired ? "closed" : job ? "job" : "unconfirmed",
      reason: "检索命中岗位条件；尚未生成 AI 匹配理由。", warning: "请打开原文核对公司、地点、截止日期和工作资格；未知不代表符合。" });
  }
  return items;
}
export const radarDirections = ["二级买方", "二级卖方", "PEVC", "投行", "其他"];
export const radarRegions = ["北京", "深圳", "上海", "香港", "其他"];
export const radarTypes = ["日常", "暑期"];
export const radarPeriods = ["7", "3", "1"];
const directionSearch: Record<string, string> = { 二级买方: '"asset management" OR "buy side" OR "fund research"', 二级卖方: '"equity research" OR "sell side"', PEVC: '"private equity" OR "venture capital"', 投行: '"investment banking"', 其他: 'finance' };
const regionSearch: Record<string, string> = { 北京: '"Beijing"', 深圳: '"Shenzhen"', 上海: '"Shanghai"', 香港: '"Hong Kong"', 其他: '(China OR Asia)' };
function expandChoices(value: string, dictionary: Record<string, string>) {
  const values = value.split(",").map(x => dictionary[x] ?? '"' + x + '"');
  return values.length > 1 ? '(' + values.join(" OR ") + ')' : values[0];
}
export function radarDays(p: RadarPreferences) {
  return Math.max(...(p.publishedWithin ?? "7").split(",").map(Number));
}
export function radarCategory(item: RadarItem) {
  if (item.category && radarDirections.includes(item.category)) return item.category;
  const text = item.title;
  if (/private equity|venture capital|私募股权|风险投资|创投/i.test(text)) return "PEVC";
  if (/investment bank|投行|投资银行|并购/i.test(text)) return "投行";
  if (/sell.side|证券研究|卖方/i.test(text)) return "二级卖方";
  if (/asset management|buy.side|基金|买方|资产管理/i.test(text)) return "二级买方";
  return "其他";
}
export function chineseRadarLocation(item: RadarItem) {
  return radarJobLocation(item)??"来源未注明地点";
}
export function radarApplicationEmail(item: RadarItem) {
  return item.evidence.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+/g)?.find(email => {
    const before = item.evidence.slice(Math.max(0, item.evidence.indexOf(email) - 100), item.evidence.indexOf(email));
    return /apply|application|resume|\bcv\b|投递|简历|申请|发送/i.test(before);
  }) ?? null;
}
export function sourcePublishedDate(metadata: unknown, evidence: string): string | null {
  const raw = evidence.match(/(?:发布时间|发布日期|date posted|posted on|published)\s*[:：]?\s*(\d{4}[-/]\d{1,2}[-/]\d{1,2})/i)?.[1] ?? (typeof metadata === "string" ? metadata : undefined);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) && date.getTime() <= Date.now() ? date.toISOString().slice(0, 10) : null;
}


export function reuseRadarEvidence(items: RadarItem[], existing: RadarItem[]) {
  const originals = new Map(existing.map(item => [item.url, item]));
  return items.map(item => {
    const original = originals.get(item.url);
    // Existing evidence is immutable; a regenerated summary must describe that
    // same evidence, never a newly fetched page attached to an old snapshot.
    return original ? { ...item, title: original.title, evidence: original.evidence, evidenceKind: original.evidenceKind,
      company: original.company, location: original.location } : item;
  });
}
