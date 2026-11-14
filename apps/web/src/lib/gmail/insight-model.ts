export const mailStandardVersion = "mail_insight_v1";
export const mailCategories = ["job", "academic", "other"] as const;
export const mailPriorities = ["important", "attention", "normal"] as const;
export type MailCategory = typeof mailCategories[number];
export type MailPriority = typeof mailPriorities[number];
export const categoryLabels: Record<MailCategory, string> = { job: "求职", academic: "学业", other: "其他" };
export const priorityLabels: Record<MailPriority, string> = { important: "重要", attention: "关注", normal: "普通" };
export type MailInsightResult = {
  category: MailCategory; priority: MailPriority; summary: string; reason: string;
  deadline: string | null; optionalOpportunity: boolean; relevantAction: boolean;
};
export function isMailCategory(value: unknown): value is MailCategory {
  return mailCategories.includes(value as MailCategory);
}
export function isMailPriority(value: unknown): value is MailPriority {
  return mailPriorities.includes(value as MailPriority);
}
export function effectiveMailPriority(result: Pick<MailInsightResult, "priority" | "deadline" | "optionalOpportunity" | "relevantAction">, override: MailPriority | null = null, now = Date.now()): MailPriority {
  if (override) return override;
  if (!result.optionalOpportunity) return result.priority;
  const remaining = result.deadline ? Date.parse(result.deadline) - now : NaN;
  return result.relevantAction && remaining > 0 && remaining <= 72 * 3600_000 ? "important" : "attention";
}
export function cleanMailInput(value: string, limit = 8000) {
  // Remove active HTML, quoted historical threads, links, identifiers and secret-bearing lines.
  return value.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/&#(?:0*39|x0*27);|&apos;/gi, "'")
    .replace(/&amp;/gi, "&").replace(/&nbsp;/gi, " ")
    .split(/\r?\n/).filter(line => !/^\s*>/.test(line) && !/verification code|one.time (?:code|password)|验证码|动态密码|access.token|api.key|password\s*[:：]|密码\s*[:：]/i.test(line))
    .join(" ").replace(/https?:\/\/\S+/gi, "[链接]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[邮箱]")
    .replace(/\b(?:sk-[\w-]+|[\w-]{20,}\.[\w-]{20,}\.[\w-]+)\b/g, "[凭据]")
    .replace(/\b\d{4,8}\b(?=.{0,12}(?:验证码|verification|OTP))|(?:验证码|verification code|OTP)\s*[:：]?\s*[\w-]+/gi, "[验证码]")
    .replace(/\s+/g, " ").trim().slice(0, limit);
}
export function validateMailInsight(value: unknown): MailInsightResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("mail_ai_invalid_result");
  const r = value as Record<string, unknown>;
  if (Object.keys(r).sort().join() !== "category,deadline,optionalOpportunity,priority,reason,relevantAction,summary"
    || !isMailCategory(r.category) || !isMailPriority(r.priority)
    || typeof r.summary !== "string" || !r.summary.trim() || !/[\u3400-\u9fff]/.test(r.summary) || [...r.summary].length > 40 || /[\r\n]/.test(r.summary)
    || typeof r.reason !== "string" || !r.reason.trim() || r.reason.length > 160
    || typeof r.optionalOpportunity !== "boolean" || typeof r.relevantAction !== "boolean"
    || !(r.deadline === null || typeof r.deadline === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(r.deadline) && Number.isFinite(Date.parse(r.deadline)))) {
    throw new Error("mail_ai_invalid_result");
  }
  return { category: r.category, priority: r.optionalOpportunity ? "attention" : r.priority,
    summary: r.summary.trim(), reason: r.reason.trim(), deadline: r.deadline as string | null,
    optionalOpportunity: r.optionalOpportunity, relevantAction: r.relevantAction };
}
export function inboxHref(category?: string, priority?: string, page = 1, message?: string) {
  const params = new URLSearchParams();
  if (isMailCategory(category)) params.set("category", category);
  if (isMailPriority(priority)) params.set("priority", priority);
  if (page > 1) params.set("page", String(page));
  if (message) params.set("message", message);
  return `/inbox${params.size ? `?${params}` : ""}`;
}
