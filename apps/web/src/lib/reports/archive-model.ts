export type Edition = "daily" | "weekly";
export type Brief = {
  id: string; type: Edition; date: string; start: string; cutoff: string; model: string;
  summary: string; sections: { title: string; tone: "green" | "blue" | "amber" | "neutral";
    items: { title: string; detail: string; sources: string[] }[] }[];
  evidence: { id: string; recordId?: string; label: string; path: string }[];
};
export type Schedule = { type: Edition; enabled: boolean; time: string };
export const defaultSchedules: Schedule[] = [{type:"daily",enabled:true,time:"22:30"},{type:"weekly",enabled:true,time:"20:00"}];
export function reportDay(now = new Date()) { return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(now); }
export function reportWindow(type: Edition, now = new Date()) {
  const date = reportDay(now);
  const start = new Date(`${date}T00:00:00+08:00`);
  if(type === "weekly") start.setUTCDate(start.getUTCDate()-6);
  return {date,start:start.toISOString(),cutoff:now.toISOString()};
}
export function isDue(s: Schedule, now = new Date()) {
  const time = new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);
  return s.enabled && time >= s.time && (s.type === "daily" || new Date(`${reportDay(now)}T00:00:00Z`).getUTCDay() === 0);
}
export function validateBrief(raw: unknown, evidence: Brief["evidence"]) {
  const r = raw as Pick<Brief,"summary"|"sections">;
  const ids = new Set(evidence.map(e=>e.id));
  if(!r || typeof r.summary!=="string" || !r.summary.trim() || r.summary.length>700 || !Array.isArray(r.sections) || r.sections.length<1 || r.sections.length>7) throw new Error("invalid_report");
  for(const s of r.sections) {
    if(typeof s.title!=="string" || s.title.length>60 || !["green","blue","amber","neutral"].includes(s.tone) || !Array.isArray(s.items) || s.items.length>6) throw new Error("invalid_report");
    for(const i of s.items) if(typeof i.title!=="string" || !i.title.trim() || i.title.length>100 || typeof i.detail!=="string" || i.detail.length>700 || !Array.isArray(i.sources) || !i.sources.length || i.sources.some(id=>!ids.has(id))) throw new Error("invalid_report_source");
  }
  return r;
}
