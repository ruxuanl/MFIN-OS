import { createHash } from "node:crypto";

import { GMAIL_BODY_LIMIT, GMAIL_RULE_VERSION } from "./constants";
import type { GmailHeader, GmailMessageResource, GmailPart } from "./google-gmail";

export type SourceIdentity = "job_forward" | "personal_forward" | "academic_forward" | "gmail" | "unknown";
export type MailClassification = "job" | "academic" | "personal" | "irrelevant" | "pending";
export type AttachmentProjection = {
  providerAttachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
};
export type MailProjection = {
  providerMessageId: string;
  providerThreadId: string;
  historyId: string;
  receivedAt: string;
  senderSummary: string | null;
  subject: string;
  body: string;
  summary: string | null;
  evidenceExcerpt: string | null;
  sourceIdentity: SourceIdentity;
  classification: MailClassification;
  confidence: number;
  needsAction: boolean;
  actionTitle: string | null;
  actionDueAt: string | null;
  isInterviewInvitation: boolean;
  gmailLink: string;
  contentHash: string;
  attachments: AttachmentProjection[];
  ruleVersion: typeof GMAIL_RULE_VERSION;
};

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeText(value: string, limit = GMAIL_BODY_LIMIT) {
  return value.replace(/\u0000/g, "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function header(headers: GmailHeader[] | undefined, name: string) {
  return headers?.find((item) => item.name?.toLowerCase() === name.toLowerCase())?.value?.trim() ?? "";
}

function collectParts(part: GmailPart | undefined, output: GmailPart[] = []) {
  if (!part) return output;
  output.push(part);
  for (const child of part.parts ?? []) collectParts(child, output);
  return output;
}

function extractBody(message: GmailMessageResource) {
  const parts = collectParts(message.payload);
  const plain = parts.find((part) => part.mimeType === "text/plain" && part.body?.data)?.body?.data;
  const html = parts.find((part) => part.mimeType === "text/html" && part.body?.data)?.body?.data;
  if (plain) return normalizeText(decodeBase64Url(plain));
  if (html) return normalizeText(stripHtml(decodeBase64Url(html)));
  return normalizeText(message.snippet ?? "");
}

function recoverIdentity(headers: GmailHeader[] | undefined, body: string): SourceIdentity {
  const routing = [
    header(headers, "delivered-to"), header(headers, "x-original-to"), header(headers, "to"), body.slice(0, 3000)
  ].join(" ").toLowerCase();
  const matchesConfigured = (value: string | undefined) =>
    (value ?? "").split(",").map((item) => item.trim().toLowerCase()).some((item) => item.length > 0 && routing.includes(item));
  if (matchesConfigured(process.env.GMAIL_JOB_FORWARD_IDENTIFIERS)) return "job_forward";
  if (matchesConfigured(process.env.GMAIL_PERSONAL_FORWARD_IDENTIFIERS)) return "personal_forward";
  if (/@(connect\.)?hku\.hk|@hku\.hk/.test(routing)) return "academic_forward";
  return routing.includes("@gmail.com") ? "gmail" : "unknown";
}

function classify(source: SourceIdentity, subject: string, body: string) {
  const text = `${subject} ${body.slice(0, 8000)}`.toLowerCase();
  const academic = /hku|university|course|module|assignment|exam|lecture|tutorial|港大|课程|作业|考试/.test(text);
  const job = /interview|application|recruit|career|intern|graduate programme|assessment|offer|面试|申请|实习|校招|笔试/.test(text);
  const personalAction = /appointment|booking|payment due|renewal|截止|预约|账单|续费/.test(text);
  if (source === "academic_forward" || academic) return { classification: "academic" as const, confidence: source === "academic_forward" ? 0.96 : 0.82 };
  if (source === "job_forward" || job) return { classification: "job" as const, confidence: source === "job_forward" ? 0.96 : 0.84 };
  if (source === "personal_forward" || personalAction) return { classification: "personal" as const, confidence: source === "personal_forward" ? 0.94 : 0.75 };
  return { classification: "pending" as const, confidence: 0.45 };
}

function extractDate(text: string) {
  const iso = text.match(/\b(20\d{2})[-/]([01]?\d)[-/]([0-3]?\d)(?:\s+(\d{1,2}):([0-5]\d))?/);
  if (!iso) return null;
  const [, year, month, day, hour = "09", minute = "00"] = iso;
  const date = new Date(`${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:00+08:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function projectGmailMessage(message: GmailMessageResource): MailProjection {
  if (!message.id || !message.threadId || !message.historyId || !message.internalDate) {
    throw new Error("gmail_message_required_fields_missing");
  }
  const headers = message.payload?.headers;
  const body = extractBody(message);
  const subject = normalizeText(header(headers, "subject"), 500);
  const senderSummary = normalizeText(header(headers, "from"), 320) || null;
  const sourceIdentity = recoverIdentity(headers, body);
  const result = classify(sourceIdentity, subject, body);
  const actionLanguage = /action required|please (?:complete|confirm|reply|attend)|deadline|due|请.{0,12}(?:完成|确认|参加)|截止/i;
  const interviewLanguage = /interview invitation|invite.{0,24}interview|面试邀请|邀请.{0,12}面试/i;
  const combined = `${subject}\n${body}`;
  const actionDueAt = extractDate(combined);
  const isInterviewInvitation = result.classification === "job" && interviewLanguage.test(combined) && Boolean(actionDueAt);
  const needsAction = isInterviewInvitation || actionLanguage.test(combined);
  const summary = result.classification === "personal"
    ? normalizeText(needsAction ? `个人事项：${subject || "邮件行动"}${actionDueAt ? `；日期 ${actionDueAt}` : ""}` : "个人事项：未发现明确行动", 2000)
    : normalizeText(message.snippet ?? body.slice(0, 600), 2000) || null;
  const evidenceExcerpt = normalizeText(
    isInterviewInvitation ? combined.match(/.{0,180}(?:interview|面试).{0,420}/is)?.[0] ?? message.snippet ?? "" : message.snippet ?? "",
    1000
  ) || null;
  const attachments = collectParts(message.payload)
    .filter((part) => Boolean(part.filename && part.body?.attachmentId))
    .map((part) => ({
      providerAttachmentId: part.body!.attachmentId!,
      filename: normalizeText(part.filename!, 500),
      mimeType: normalizeText(part.mimeType ?? "application/octet-stream", 200),
      size: part.body?.size ?? 0
    }));
  return {
    providerMessageId: message.id,
    providerThreadId: message.threadId,
    historyId: message.historyId,
    receivedAt: new Date(Number(message.internalDate)).toISOString(),
    senderSummary,
    subject,
    body,
    summary,
    evidenceExcerpt,
    sourceIdentity,
    classification: result.classification,
    confidence: isInterviewInvitation ? 0.98 : result.confidence,
    needsAction,
    actionTitle: needsAction ? normalizeText(subject || "处理邮件行动", 300) : null,
    actionDueAt,
    isInterviewInvitation,
    gmailLink: `https://mail.google.com/mail/u/0/#all/${message.id}`,
    contentHash: createHash("sha256").update(`${message.id}\u0000${subject}\u0000${body}`).digest("hex"),
    attachments,
    ruleVersion: GMAIL_RULE_VERSION
  };
}

export function opportunityMatchesMail(
  opportunity: { id: string; company: string; role_title: string },
  mail: Pick<MailProjection, "subject" | "body">
) {
  const haystack = `${mail.subject} ${mail.body}`.toLowerCase();
  const company = opportunity.company.trim().toLowerCase();
  const role = opportunity.role_title.trim().toLowerCase();
  return company.length >= 2 && role.length >= 2 && haystack.includes(company) && haystack.includes(role);
}
