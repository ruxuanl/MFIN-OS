import type { RadarItem } from "./radar-model";
import { radarHeadline } from "./radar-results";
import { radarSourceTime } from "./radar-source-time";

export const initialDailyProfile = "目标方向：二级买方投研、二级卖方研究、一级PEVC。岗位含金量依据原始岗位证据由AI判断。其他个人资格未提供，不推定满足。";
export type DailyAssessment = { qualification: "符合" | "待核实" | "不符"; match: number; quality: number; preference: string; urgency: string; reason: string; gaps: string; nextStep: string };
export type DailyRecommendation = RadarItem & { assessment: DailyAssessment };
export type DailySnapshot = { settings: { enabled: boolean; profile: string } | null; reports: { report_day: string; status: string; created_at: string; finished_at: string | null; error_code: string | null; recommendations: DailyRecommendation[] }[] };
export function selectDailyRecommendations(items: DailyRecommendation[], knownUrls: Set<string>, now = new Date()) {
  return items.filter(item => item.assessment.qualification !== "不符" && item.assessment.match >= 70 && item.assessment.quality >= 70
    && !knownUrls.has(item.url) && item.kind !== "closed" && (!item.deadline || item.deadline >= now.toISOString().slice(0,10))
    && radarHeadline(item) && radarSourceTime(item) && item.isRecruiting === true)
    .sort((a,b) => (b.assessment.match+b.assessment.quality)-(a.assessment.match+a.assessment.quality)).slice(0,5);
}
export type ProgressCandidate = { id: string; company: string; role_title: string; created_at: string };
export type ProgressMail = { id: string; subject: string; summary: string | null; received_at: string };
const normalized = (value: string) => value.toLowerCase().replace(/[\s·•,，.。()（）_-]/g, "");
function includesName(text: string, name: string) {
  if (/^[a-z0-9 &.-]+$/i.test(name)) {
    const escaped=name.trim().replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,"i").test(text);
  }
  return normalized(text).includes(normalized(name));
}
export function candidateMailProgress(candidates: ProgressCandidate[], mails: ProgressMail[]) {
  return mails.flatMap(mail => {
    const text = `${mail.subject} ${mail.summary ?? ""}`;
    if (!/面试邀请|面试安排|笔试通知|测评邀请|招聘进展|申请进展|申请结果|补充材料|未通过|录用通知|interview invitation|invite.{0,30}interview|schedule.{0,20}interview|assessment invitation|application (?:status|update|unsuccessful)|offer letter|unfortunately.{0,50}(?:application|proceed)/i.test(text)
      || /面经|面试技巧|面试指南|interview tips|interview guide/i.test(mail.subject)) return [];
    const matches=candidates.filter(c => normalized(c.company).length>=2 && !/未知|待核实|某公司/.test(c.company)
      && includesName(text,c.company) && Date.parse(mail.received_at)>=Date.parse(c.created_at));
    // Company-only collisions must not silently attach to an arbitrary role.
    const exact=matches.filter(c=>normalized(c.role_title).length>=4 && normalized(text).includes(normalized(c.role_title)));
    const chosen=exact.length===1?exact[0]:matches.length===1?matches[0]:null;
    return chosen ? [{ candidate: chosen, mail, confirmed: exact.length===1 }] : [];
  }).slice(0,10);
}
