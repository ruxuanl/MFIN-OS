import type { MailCategory, MailPriority } from "./insight-model";
export type InsightRow = {
  message_id: string; user_id: string; category: MailCategory | null; priority: MailPriority | null;
  summary: string | null; reason: string | null; deadline: string | null; optional_opportunity: boolean; relevant_action: boolean;
  category_override: MailCategory | null; priority_override: MailPriority | null;
  status: string; fingerprint: string | null; standard_version: string | null; model: string | null; error_code: string | null;
  claim_token: string | null; claimed_at: string | null; usage_id: string | null; updated_at: string;
};
export type InboxMailRow = {
  id: string; user_id: string; received_at: string; sender_summary: string | null; subject: string; gmail_link: string;
  category: MailCategory; priority: MailPriority; summary: string; analysis_status: string; reason: string | null; deadline: string | null;
  category_override: MailCategory | null; priority_override: MailPriority | null; model: string | null; standard_version: string | null;
};
export type MailListRow = Pick<InboxMailRow,"id"|"category"|"priority"|"summary"|"received_at"|"sender_summary">;
export type MailboxView = {
  counts: { category: MailCategory; priority: MailPriority; count: number }[];
  total: number; unfinished: number; queued: number; messages: MailListRow[];
};
