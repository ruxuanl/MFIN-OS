import { parseInternshipJd } from "@/lib/internships/jd-parser";
export type RadarPreferences = { direction: string; region: string; keywords: string; internshipType: string; profile: string };
export type RadarItem = {
  url: string; title: string; company: string; location: string; deadline: string | null;
  evidence: string; evidenceKind: "page_text" | "snippet"; kind: "job" | "unconfirmed" | "closed";
  reason: string; warning: string; status?: "pending" | "added" | "ignored";
};
export type RadarSnapshot = { preferences?: RadarPreferences; items: RadarItem[]; runs: { id: string; status: string; created_at: string; error: string | null }[] };
export const radarDefaults: RadarPreferences = {
  direction: "investment banking", region: "Hong Kong", keywords: "",
  internshipType: "off-cycle",
  profile: "香港大学 MFin，预计 2027 年毕业；主攻买方研究、卖方研究、投资银行；香港实习优先。工作资格、入职日期、每周天数及技能待本人核实。"
};
export function parseRadarPreferences(input: Record<string, unknown>): RadarPreferences {
  const output = {} as RadarPreferences;
  for (const key of Object.keys(radarDefaults) as (keyof RadarPreferences)[]) {
    const value = input[key];
    if (typeof value !== "string" || value.length > (key === "profile" ? 600 : 120)) throw new Error("invalid_conditions");
    output[key] = value.trim();
  }
  if (!output.direction || !output.region || !output.internshipType || !output.profile) throw new Error("invalid_conditions");
  // Search fields are public job conditions, never a CV/contact payload.
  if (/[\w.+-]+@[\w.-]+|https?:|\b\d{8,}\b/u.test([output.direction, output.region, output.keywords, output.internshipType].join(" "))) throw new Error("invalid_conditions");
  return output;
}
export function radarQuery(p: RadarPreferences) {
  // The old saved defaults contain several alternatives. Requiring every term
  // favors generic career indexes instead of individual requisitions.
  const alternatives = (value: string, pattern: RegExp) => {
    const matches = [...new Set(value.match(pattern)?.map(x => x.toLowerCase()) ?? [])];
    return matches.length > 1 ? `(${matches.map(x => `"${x}"`).join(" OR ")})` : value;
  };
  const direction = alternatives(p.direction, /equity research|investment banking|credit research|asset management|buy.side research|sell.side research/gi);
  const type = alternatives(p.internshipType, /off-cycle|summer|part-time|winter/gi);
  return `"${p.region}" ${direction} ${type} ${p.keywords} internship job vacancy -insurance -"wealth advisor"`.trim();
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
  return /\/(?:forum|reel|interview)\//i.test(item.url)
    || /interview experience|interview questions|coaches,? events|coaches.*resources|面试经验|面经|论坛讨论/i.test(item.title);
}
export function visibleRadarItems<T extends RadarItem>(items: T[]): T[] {
  const rank = (item: RadarItem) => item.kind === "closed" ? 3 : item.kind !== "job" ? 1
    : /research|credit|bank|investment|financ|analyst|实习.*研究|研究|投行/i.test(item.title) ? 0 : 2;
  return items.filter(item => !isNonRecruitingPage(item)).sort((a,b) => rank(a)-rank(b));
}
export function toRadarItems(results: unknown): RadarItem[] {
  if (!Array.isArray(results)) throw new Error("search_invalid_response");
  const seen = new Set<string>();
  const items: RadarItem[] = [];
  for (const entry of results.slice(0, 10)) {
    if (!entry || typeof entry !== "object") continue;
    const r = entry as Record<string, unknown>;
    const url = typeof r.url === "string" ? normalizeJobUrl(r.url) : null;
    if (!url || url.length > 2048 || seen.has(url) || typeof r.title !== "string") continue;
    seen.add(url);
    const pageText = typeof r.raw_content === "string" ? r.raw_content.trim() : "";
    const evidence = (pageText || (typeof r.content === "string" ? r.content : "")).slice(0, 6000);
    const title = r.title.slice(0, 240);
    if (isNonRecruitingPage({ title, url })) continue;
    const closed = /no longer accepting|position (?:has been )?filled|job (?:has )?expired|applications? (?:are )?closed|已截止|停止招聘/i.test(evidence);
    const job = /intern|实习/i.test(title) && /\/(?:job|jobs|requisition|position|vacancy|view)\/[^/?]+|[?&](?:jobid|job_id|gh_jid)=/i.test(url)
      && !/\b\d+\+?\s+(?:jobs|internships)|jobs in|search results|招聘列表/i.test(title);
    const explicitCompany = evidence.match(/(?:^|\n)(?:公司|公司名称|company|employer)\s*[:：]\s*([^\n]{1,240})/i)?.[1]?.trim();
    const explicitLocation = evidence.match(/(?:^|\n)(?:地点|工作地点|location)\s*[:：]\s*([^\n]{1,240})/i)?.[1]?.trim();
    const deadline = pageText ? parseInternshipJd(pageText.slice(0, 6000)).deadline : null;
    const expired = deadline ? deadline < new Date().toISOString().slice(0, 10) : false;
    items.push({ url, title, company: explicitCompany ?? "未知／待核实", location: explicitLocation ?? "未知／待核实", deadline,
      evidence, evidenceKind: pageText ? "page_text" : "snippet", kind: closed || expired ? "closed" : job ? "job" : "unconfirmed",
      reason: "检索命中岗位条件；尚未生成 AI 匹配理由。", warning: "请打开原文核对公司、地点、截止日期和工作资格；未知不代表符合。" });
  }
  return items;
}
