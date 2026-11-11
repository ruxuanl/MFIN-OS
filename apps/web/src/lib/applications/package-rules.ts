// Rule-based application package v1 (issue #13). Deterministic, no AI, no network.
// It only prepares a checklist, a resume recommendation and dates; submitting the
// application always happens on the employer's own site, by the user.

export const packageRuleVersion = "package_rules_v1";

export type PackageItem = {
  key: string;
  label: string;
  required: boolean;
  source: "default" | "jd_rule";
  evidence: string | null;
};

type ChecklistRule = { key: string; label: string; pattern: RegExp; required: boolean };

const checklistRules: ChecklistRule[] = [
  { key: "cover_letter", label: "求职信 / Cover Letter", pattern: /cover\s*letter|motivation\s*letter|求职信|自荐信/i, required: true },
  { key: "transcript", label: "成绩单", pattern: /transcript|成绩单|\bGPA\b/i, required: true },
  { key: "language", label: "语言成绩证明", pattern: /IELTS|TOEFL|雅思|托福|CET-?6|language\s+certificate/i, required: true },
  { key: "certificate", label: "专业证书", pattern: /\b(CFA|FRM|ACCA|CPA)\b|资格证书/i, required: false },
  { key: "writing_sample", label: "写作样本 / 研究报告", pattern: /writing\s*sample|stock\s*pitch|research\s*sample|写作样本|研究报告样本/i, required: true },
  { key: "references", label: "推荐人 / 推荐信", pattern: /reference(s|\s*letter)?\b|referee|推荐信|推荐人/i, required: false },
  { key: "online_assessment", label: "在线测评 / 笔试准备", pattern: /online\s*(test|assessment)|HireVue|numerical\s*reasoning|在线测评|笔试/i, required: false },
  { key: "video_interview", label: "视频面试准备", pattern: /video\s*interview|视频面试/i, required: false },
  { key: "work_authorization", label: "工作资格 / 签证确认", pattern: /right\s*to\s*work|work\s*(visa|permit|authori[sz]ation)|工作签证|工作许可/i, required: true }
];

function evidenceAround(text: string, index: number, length: number) {
  const start = Math.max(0, index - 40);
  const end = Math.min(text.length, index + length + 60);
  return text.slice(start, end).replace(/\s+/g, " ").trim().slice(0, 160);
}

export function buildChecklist(jdText: string | null | undefined): PackageItem[] {
  const text = jdText ?? "";
  const items: PackageItem[] = [
    { key: "cv", label: "简历（确认使用的版本）", required: true, source: "default", evidence: null }
  ];
  for (const rule of checklistRules) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    items.push({
      key: rule.key,
      label: rule.label,
      required: rule.required,
      source: "jd_rule",
      evidence: evidenceAround(text, match.index, match[0].length)
    });
  }
  items.push({ key: "final_review", label: "提交前自查：岗位、地点、截止日期与材料一致", required: true, source: "default", evidence: null });
  return items;
}

export type ResumeOption = {
  id: string;
  versionNumber: number;
  createdAt: string;
  documentKind: "master" | "tailored" | string;
  label: string;
  archived: boolean;
};

export type ResumeRecommendation = { versionId: string | null; reason: string };

export function recommendResume(options: ResumeOption[], assignedVersionId: string | null): ResumeRecommendation {
  if (assignedVersionId && options.some((option) => option.id === assignedVersionId)) {
    return { versionId: assignedVersionId, reason: "规则：使用该岗位已绑定的简历版本。" };
  }
  const active = options.filter((option) => !option.archived);
  const newest = (list: ResumeOption[]) =>
    [...list].sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const master = newest(active.filter((option) => option.documentKind === "master"));
  if (master) {
    return { versionId: master.id, reason: `规则：该岗位暂无专用版本，回退到最新 Master（${master.label} v${master.versionNumber}）。` };
  }
  const any = newest(active);
  if (any) return { versionId: any.id, reason: `规则：材料库没有 Master，暂用最新版本（${any.label} v${any.versionNumber}）。` };
  return { versionId: null, reason: "材料库暂无简历；请先在“材料”页上传 Master 简历。" };
}

const dayMs = 86_400_000;

function toDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function suggestedStartDate(deadline: string | null, today: string, requiredItemCount: number) {
  if (!deadline || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const prepDays = 2 + Math.max(0, requiredItemCount);
  const start = new Date(new Date(`${deadline}T00:00:00Z`).getTime() - prepDays * dayMs);
  const todayDate = new Date(`${today}T00:00:00Z`);
  return toDateOnly(start < todayDate ? todayDate : start);
}

const httpsUrl = /https:\/\/[^\s<>"'）)]+/i;

export function officialApplyUrl(sourceUrl: string | null, applicationMethod: string | null, rawJd: string | null) {
  if (sourceUrl && /^https:\/\//i.test(sourceUrl)) return sourceUrl.slice(0, 2048);
  for (const text of [applicationMethod, rawJd]) {
    const match = text ? httpsUrl.exec(text) : null;
    if (match) return match[0].replace(/[.,;，。；]+$/, "").slice(0, 2048);
  }
  return null;
}
