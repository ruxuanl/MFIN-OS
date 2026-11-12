// Rule parser for multi-hop job questions (#16), e.g. "投过、要求 Python、还没回复".
// Produces structured filters for query_my_opportunities. Deterministic; not AI.
import { findSkills } from "./dictionary";

export type QuestionFilters = {
  skills: string[];
  stages: string[] | null;
  track: "internship" | "graduate" | null;
  location: string | null;
  replied: boolean | null;
  resumeGap: boolean | null;
  deadlineWithinDays: number | null;
};

export const appliedStages = ["submitted", "test", "interview", "waiting", "offer"];
export const notAppliedStages = ["new", "evaluation", "preparation"];

const locations: [RegExp, string][] = [
  [/香港|hong\s*kong|\bhk\b/, "香港"],
  [/上海|shanghai/, "上海"],
  [/北京|beijing/, "北京"],
  [/深圳|shenzhen/, "深圳"],
  [/新加坡|singapore/, "新加坡"]
];

// Words that look like skills but describe the question itself are removed before skill matching.
const nonSkillPhrases = /英文岗位|英语岗位/g;

export function parseQuestion(question: string): QuestionFilters {
  const text = question.toLowerCase().replace(/\s+/g, " ").trim();

  let replied: boolean | null = null;
  if (/还没回复|没回复|未回复|没有回复|没有回音|没回音|没消息|没有回应|no reply|no response|haven't heard|not heard back/.test(text)) replied = false;
  else if (/已回复|有回复|回复了|已经回复|got a reply|heard back|responded|replied/.test(text)) replied = true;

  let stages: string[] | null = null;
  if (/面试|interview/.test(text)) stages = ["interview"];
  else if (/笔试|测评|online test|assessment/.test(text)) stages = ["test"];
  else if (/offer|录用/.test(text)) stages = ["offer"];
  else if (/还没投|未投|没投|尚未申请|还没申请|not applied|haven't applied|not yet applied|准备中/.test(text)) stages = notAppliedStages;
  else if (/投过|已投|投了|投递|已申请|申请过|applied|submitted/.test(text)) stages = appliedStages;
  else if (replied !== null) stages = appliedStages;

  let track: QuestionFilters["track"] = null;
  if (/实习|internship|\bintern\b|\binterns\b/.test(text)) track = "internship";
  else if (/秋招|校招|应届|全职|graduate|full-time|full time/.test(text)) track = "graduate";

  const location = locations.find(([pattern]) => pattern.test(text))?.[1] ?? null;

  let deadlineWithinDays: number | null = null;
  if (/今天截止|due today|closes today/.test(text)) deadlineWithinDays = 0;
  else if (/三天内|3 ?天内|three days|3 days/.test(text)) deadlineWithinDays = 3;
  else if (/两周内|14 ?天内|two weeks|2 weeks/.test(text)) deadlineWithinDays = 14;
  else if (/本周|这周|一周内|7 ?天内|this week|within a week|7 days/.test(text)) deadlineWithinDays = 7;

  let resumeGap: boolean | null = null;
  if (/简历(里|上|中)?(没有|没写|缺少|缺|不具备)|not on my resume|missing from my resume|resume lacks|my resume doesn't|gap/.test(text)) resumeGap = true;
  else if (/简历(都|已)(有|覆盖|写了)|covered by my resume/.test(text)) resumeGap = false;

  const skills = findSkills(text.replace(nonSkillPhrases, " ")).map((skill) => skill.key);
  return { skills, stages, track, location, replied, resumeGap, deadlineWithinDays };
}

export function describeFilters(filters: QuestionFilters, skillLabel: (key: string) => string) {
  const parts: string[] = [];
  if (filters.stages) {
    const key = filters.stages.join(",");
    parts.push(key === appliedStages.join(",") ? "已投递" : key === notAppliedStages.join(",") ? "未投递" : filters.stages.join(" / "));
  }
  if (filters.track) parts.push(filters.track === "internship" ? "实习" : "秋招");
  if (filters.location) parts.push(filters.location);
  for (const skill of filters.skills) parts.push(`要求 ${skillLabel(skill)}`);
  if (filters.replied === false) parts.push("未回复");
  if (filters.replied === true) parts.push("已回复");
  if (filters.resumeGap === true) parts.push("简历未覆盖");
  if (filters.resumeGap === false) parts.push("简历已覆盖");
  if (filters.deadlineWithinDays !== null) parts.push(filters.deadlineWithinDays === 0 ? "今天截止" : `${filters.deadlineWithinDays} 天内截止`);
  return parts;
}

export function hasFilters(filters: QuestionFilters) {
  return Boolean(filters.skills.length || filters.stages || filters.track || filters.location
    || filters.replied !== null || filters.resumeGap !== null || filters.deadlineWithinDays !== null);
}

export const presetQuestions = [
  "投过、要求 Python、还没回复",
  "要求的技能我简历里没有的秋招岗位",
  "本周截止、还没投的岗位",
  "已经回复了的投递",
  "香港的岗位里要求粤语的"
];
