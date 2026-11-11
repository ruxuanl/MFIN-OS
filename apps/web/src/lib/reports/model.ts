export const reportTypes = ["morning", "evening", "weekly"] as const;
export type ReportType = (typeof reportTypes)[number];

export const reportLabels: Record<ReportType, string> = {
  morning: "晨间简报",
  evening: "晚间收尾",
  weekly: "每周复盘"
};

export const sectionLabels: Record<string, string> = {
  schedule: "今日固定日程",
  must_do: "必须处理",
  deadline: "截止提醒",
  focus: "三个重点",
  internship: "实习重点岗位",
  graduate: "秋招重点岗位",
  communication: "邮件与沟通",
  risk: "风险与来源异常",
  confirmed: "已确认安排",
  pending: "待确认时间块",
  incomplete: "未完成事项",
  weekly_summary: "本周摘要"
};

export function isReportType(value: string): value is ReportType {
  return reportTypes.includes(value as ReportType);
}

export function formatSchedule(schedule: {
  report_type: string;
  local_time: string;
  weekday: number | null;
  time_zone: string;
}) {
  const time = schedule.local_time.slice(0, 5);
  if (schedule.report_type === "weekly") return `每周日 ${time} · ${schedule.time_zone}`;
  return `每天 ${time} · ${schedule.time_zone}`;
}

export function groupReportItems<T extends { section: string }>(items: T[]) {
  return Map.groupBy(items, (item) => item.section);
}


const strategyLabels: Record<string, string> = {
  rules_v1: "规则排序 v1 · 非 AI",
  rules_v2: "规则排序 v2 · 非 AI",
  ai: "AI 生成"
};

export function strategyLabel(strategy: string | null | undefined) {
  return (strategy && strategyLabels[strategy]) || "规则排序 · 非 AI";
}
