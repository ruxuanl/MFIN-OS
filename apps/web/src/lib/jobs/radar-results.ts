import { radarCategory, radarDays, visibleRadarItems, type RadarItem, type RadarPreferences } from "./radar-model";
import { radarSourceTime } from "./radar-source-time";
import { radarSourceLabel } from "./radar-sources";
import { matchesRadarRegion } from "./radar-location";

const unknown = /^(?:未知|待核实|未披露|某|暂无)/;

export function radarItemType(item: RadarItem): "日常" | "暑期" | null {
  // Job title wins over related jobs and navigation in the source body.
  if (/summer|暑期|暑假/i.test(item.title)) return "暑期";
  if (/off[ -]cycle|part[ -]time|日常|兼职/i.test(item.title)) return "日常";
  const schedule = item.evidence.match(/(?:^|\n)(?:工作时间|实习时间|每周|工作天数|work schedule)[^\n]{0,100}/i)?.[0] ?? "";
  return /每周.*[三四五3-5]|part[ -]time|off[ -]cycle|日常/i.test(schedule) ? "日常" : null;
}

export function matchesRadarPreferences(item: RadarItem, p: RadarPreferences, now = new Date()) {
  if (!p.direction || !p.region || !p.internshipType) return false;
  if(p.source === "local" && !item.localSource || item.localSource && p.source && p.source!=="all" && p.source!=="local")return false;
  const source = radarSourceLabel(item.url);
  if (p.source === "wechat" && source.type !== "公众号" || p.source === "boards" && source.type !== "招聘网站") return false;
  const directions = p.direction.split(",");
  const category = radarCategory(item);
  if ((item.category || category !== "其他") && !directions.includes(category)) return false;
  const type = radarItemType(item);
  if (type && !p.internshipType.split(",").includes(type)) return false;
  // Location fields/title describe this job. Never treat incidental mentions in
  // a global footer, headquarters or related vacancies as the job's location.
  if(!matchesRadarRegion(item,p.region))return false;
  const time = radarSourceTime(item);
  if (time) {
    const to = new Date(time.to).getTime(), from = new Date(time.from).getTime();
    const chinaToday = new Date(new Date(now.getTime() + 8 * 3600000).toISOString().slice(0,10)).getTime();
    if (!Number.isFinite(to) || !Number.isFinite(from) || from > chinaToday || to < chinaToday - radarDays(p) * 86400000) return false;
  }
  return true;
}

export function radarCompany(item: RadarItem): string | null {
  if (item.company.trim() && !unknown.test(item.company)) return item.company.trim();
  const chinese = item.title.match(/^([\u3400-\u9fffA-Za-z0-9·&（）() ]{2,40}?(?:证券|基金|资本|银行|资产管理|投资管理|投资|信托|咨询|集团|有限公司|公司))(?=[-—|·：:\s]|研究所|研究部|投行部|投资银行部|招聘|日常|暑期|实习|[A-Z])/u)?.[1]?.trim();
  if (chinese && !unknown.test(chinese)) return chinese;
  const titled = item.title.match(/\bat\s+(.+?)(?:\s+[—|]|\s+-\s+|$)/i)?.[1]?.trim();
  if (titled && !/^(?:a |an |the |\.{3})/i.test(titled)) return titled;
  const labeled = item.evidence.match(/(?:^|\n)(?:company|employer|公司|公司名称)\s*[:：]\s*([^\n]{1,120})/i)?.[1]?.trim();
  if (labeled && !unknown.test(labeled)) return labeled;
  const slug = item.url.match(/-at-([a-z0-9-]+?)(?:-\d{6,})(?:[/?]|$)/i)?.[1];
  if (!slug) return null;
  const name = slug.replace(/-/g, " ");
  // Use original spelling from evidence; do not invent a company from a host.
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return item.evidence.match(new RegExp(`\\b${escaped}\\b`, "i"))?.[0] ?? null;
}

export function radarHeadline(item: RadarItem): string | null {
  if (item.isRecruiting === false || !/\bintern(?:ship)?s?\b|实习/i.test(item.title)) return null;
  const company = radarCompany(item);
  const roleTitle = (company ? item.title.replace(company, "") : item.title).replace(/[-—|·：:\s]/g, "");
  if (/^(?:(?:日常|暑期)?实习(?:生)?(?:招聘)?|招聘实习生?|internships?(?:recruitment)?)$/i.test(roleTitle)) return null;
  const summary = item.summary?.trim();
  if (summary && /[\u3400-\u9fff]/u.test(summary) && !/尚未生成|暂未生成|待核实|非招聘|列表页|网页|公司未|某公司/.test(summary)) {
    return `${company && !summary.toLowerCase().includes(company.toLowerCase()) ? company + " · " : ""}${summary.split(/[。！？\n]/)[0].replace(/[；;]+$/, "")}。`;
  }
  if (!company) return null;
  if (/[\u3400-\u9fff]/u.test(item.title) && item.title.includes(company)) {
    return `${item.title.split(/[|｜]/)[0].replace(/[-—]+/g, " · ").replace(/[。；;]+$/, "").slice(0, 100)}。`;
  }
  const title = `${item.title} ${new URL(item.url).pathname.replace(/-/g, " ")}`;
  const role = /credit research|信用研究/i.test(title) ? "信用研究" : /equity research|股票研究/i.test(title) ? "股票研究"
    : /investment bank|投行/i.test(title) ? "投资银行" : /private equity|私募股权/i.test(title) ? "私募股权投资"
    : /venture capital|风险投资/i.test(title) ? "风险投资" : /quant|量化/i.test(title) ? "量化研究"
    : /trad(?:er|ing)|交易/i.test(title) ? "交易" : /asset management|资产管理/i.test(title) ? "资产管理"
    : /research|研究/i.test(title) ? "研究" : /invest|投资/i.test(title) ? "投资" : /financ|财务|金融/i.test(title) ? "财务" : null;
  if (!role) return null;
  const season = radarItemType(item);
  return `${company}招聘${/\bMBA\b/i.test(title) ? "工商管理硕士" : ""}${season === "暑期" ? "暑期" : season === "日常" ? "日常" : ""}${role}实习生。`;
}

export function filteredRadarItems<T extends RadarItem>(items: T[], preferences: RadarPreferences, now = new Date()): T[] {
  return visibleRadarItems(items).filter(item => matchesRadarPreferences(item, preferences, now) && radarHeadline(item));
}

export function selectRadarEvidence<T extends RadarItem>(items: T[], limit = 10): T[] {
  const ranked = [...items].sort((a,b) => Number(Boolean(radarHeadline(b))) - Number(Boolean(radarHeadline(a))) || Number(Boolean(radarSourceTime(b))) - Number(Boolean(radarSourceTime(a))) || Number(b.kind === "job") - Number(a.kind === "job"));
  return ranked.slice(0, limit);
}
