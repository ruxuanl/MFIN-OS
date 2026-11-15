export type RadarSourceTime = {
  from: string; to: string; basis: "published" | "updated" | "relative" | "provider" | "filename"; approximate: boolean; reference?: string;
};
type TimedSource = { sourceTime?: RadarSourceTime | null; sourceObservedAt?: string; discoveredAt?: string; publishedAt?: string | null; evidence: string };
const dayMs = 86_400_000;
const chinaDay = (date: Date) => new Date(date.getTime() + 8 * 3_600_000).toISOString().slice(0, 10);
function absolute(value: string): string | null {
  const match = value.match(/(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})/);
  if (!match) return null;
  const day = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}
function number(value: string) {
  if (/^\d+$/.test(value)) return Number(value);
  const digits: Record<string, number> = { 一:1, 二:2, 两:2, 三:3, 四:4, 五:5, 六:6, 七:7, 八:8, 九:9 };
  if (value.includes("十")) { const [tens, units] = value.split("十"); return (digits[tens] ?? 1) * 10 + (digits[units] ?? 0); }
  return digits[value] ?? 0;
}
export function parseRadarSourceTime(metadata: unknown, evidence: string, observedAt = new Date()): RadarSourceTime | null {
  const header = evidence.slice(0, 1500);
  const tags = [...evidence.matchAll(/(发布时间|发布日期|发表于|更新于|更新时间|更新日期|最后更新|date posted|posted on|datePublished|dateModified|published(?: on)?|last updated|updated(?: on)?)\s*["'：:\s]*([^\n]{0,80})/gi)];
  for (const tagged of tags) {
    const explicit = absolute(tagged[2]);
    if (explicit) return { from: explicit, to: explicit, basis: /更新|modif|updat/i.test(tagged[1]) ? "updated" : "published", approximate: false };
  }
  const headerDate = header.slice(0, 500).match(/(?:^|\n)\s*(\d{4}[-/年]\d{1,2}[-/月]\d{1,2})/);
  const standalone = headerDate ? absolute(headerDate[1]) : null;
  if (standalone) return { from: standalone, to: standalone, basis: "published", approximate: false };
  const today = new Date(chinaDay(observedAt) + "T00:00:00Z");
  const dayAgo = (days: number) => new Date(today.getTime() - days * dayMs).toISOString().slice(0, 10);
  const relative = header.match(/(\d{1,3}|[一二两三四五六七八九十]+)\s*(分钟|小时|天|周|个月|minutes?|hours?|days?|weeks?|months?)\s*(?:前|ago)/i);
  if (relative) {
    const count = number(relative[1]);
    const unit = relative[2];
    if (/分钟|小时|minute|hour/i.test(unit)) {
      const elapsed = count * (/小时|hour/i.test(unit) ? 3_600_000 : 60_000);
      const date = chinaDay(new Date(observedAt.getTime() - elapsed));
      return { from: date, to: date, basis: "relative", approximate: true };
    }
    const days = count * (/周|week/i.test(unit) ? 7 : /月|month/i.test(unit) ? 30 : 1);
    const precision = /周|week/i.test(unit) ? 7 : /月|month/i.test(unit) ? 30 : 1;
    return { from: dayAgo(days + precision), to: dayAgo(days), basis: "relative", approximate: true };
  }
  if (/(?:发布|发表|更新|posted|updated)[^\n]{0,10}(?:今天|today)|(?:今天|today)[^\n]{0,10}(?:发布|发表|更新|posted|updated)/i.test(header)) return { from: dayAgo(0), to: dayAgo(0), basis: "relative", approximate: true };
  if (/(?:发布|发表|更新|posted|updated)[^\n]{0,10}(?:昨天|yesterday)|(?:昨天|yesterday)[^\n]{0,10}(?:发布|发表|更新|posted|updated)/i.test(header)) return { from: dayAgo(1), to: dayAgo(1), basis: "relative", approximate: true };
  const provider = typeof metadata === "string" ? (absolute(metadata) ?? (() => { const date = new Date(metadata); return Number.isFinite(date.getTime()) ? chinaDay(date) : null; })()) : null;
  return provider ? { from: provider, to: provider, basis: "provider", approximate: true } : null;
}
export function radarSourceTime(item: TimedSource): RadarSourceTime | null {
  if (item.sourceTime) return item.sourceTime;
  const anchor = item.sourceObservedAt ?? item.discoveredAt;
  // Relative text in legacy snapshots needs its discovery timestamp as anchor.
  const evidence = anchor ? item.evidence : item.evidence.replace(/(?:\d{1,3}|[一二两三四五六七八九十]+)\s*(?:分钟|小时|天|周|个月|minutes?|hours?|days?|weeks?|months?)\s*(?:前|ago)|今天|昨天|today|yesterday/gi, "");
  return parseRadarSourceTime(item.publishedAt, evidence, anchor ? new Date(anchor) : new Date());
}
export function radarTimeLabel(time: RadarSourceTime | null) {
  if (!time) return { title: "来源时间", value: "来源未提供日期", detail: "归入时间待补充，不计入最近天数" };
  return { title: time.basis === "updated" ? "来源更新时间" : "来源发布时间",
    value: time.from === time.to ? time.from : `${time.from} 至 ${time.to}`,
    detail: time.reference ?? (time.basis === "filename" ? "依据本地文件标题日期" : time.basis === "provider" ? "来源发布或更新时间 · 搜索引擎估计" : time.approximate ? "根据来源相对时间估算" : "依据网站或推文标注") };
}
