export type RecruitmentStage = "read_confirmed" | "assessment" | "interview" | "offer";

export function senderDomain(sender: string) {
  return sender.match(/(?:<|\s|^)[^<>\s@]+@([a-z0-9.-]+)(?:>|\s|$)/i)?.[1]?.toLowerCase() ?? null;
}
export function authenticatedSender(sender: string, authentication: string) {
  const domain = senderDomain(sender);
  if (!domain || !/^mx\.google\.com\s*;/i.test(authentication.trim())) return false;
  const aligned = authentication.match(/dmarc=pass\b[^;]*\bheader\.from=([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
  return domain === aligned;
}

// Only explicit notifications qualify. Negative reminders, newsletters, generic
// careers marketing and an absent receipt never imply any recruitment stage.
export function detectRecruitmentStage(subject: string, body: string, sender: string): RecruitmentStage | null {
  const domain = senderDomain(sender);
  const text = `${subject}\n${body.slice(0, 2500)}`;
  if (/cancelled|canceled|withdrawn|rescinded|rejected|unsuccessful|撤销|取消|未通过|遗憾|拒绝/i.test(subject)
    || /(?:offer|invitation).{0,30}(?:rescinded|withdrawn|cancelled|canceled)/i.test(body.slice(0, 1000))) return null;
  if (/not (?:yet )?(?:opened|read)|unopened|未读|尚未.{0,4}(?:阅读|打开)|未打开|提醒.{0,10}未/i.test(text)) return null;
  const trackers = (process.env.GMAIL_READ_RECEIPT_DOMAINS ?? "mailtrack.io,mailsuite.com").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (domain && trackers.includes(domain) && /(?:your (?:email|message).{0,100}(?:was |has been )?(?:opened|read)|(?:email|message) (?:opened|read)|已读(?:通知|提醒|回执)|邮件.{0,20}(?:已被阅读|已被打开|已读))/i.test(text)) return "read_confirmed";
  // Require the event in the subject to avoid acting on quoted application text.
  if (/interview invitation|invitation to interview|邀请.{0,16}面试|面试邀请/i.test(subject)) return "interview";
  if (/assessment invitation|invitation.{0,20}(?:assessment|online test)|online assessment invitation|笔试邀请|测评邀请|case (?:study )?invitation/i.test(subject)) return "assessment";
  if (/offer of (?:employment|internship)|(?:employment|internship) offer|录用通知|实习录用/i.test(subject)) return "offer";
  return null;
}

export function employerSenderMatches(sender: string, sourceUrl: string | null) {
  const senderHost = senderDomain(sender);
  if (!senderHost || !sourceUrl) return false;
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^(?:www|careers|jobs|career)\./, "");
    if (["linkedin.com", "gmail.com", "outlook.com", "indeed.com", "myworkdayjobs.com", "greenhouse.io", "lever.co"].some((shared) => host === shared || host.endsWith(`.${shared}`))) return false;
    return senderHost === host || senderHost.endsWith(`.${host}`);
  } catch { return false; }
}
