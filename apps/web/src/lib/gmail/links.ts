import "server-only";

import type { AppUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

export type LinkView = {
  id: string;
  status: string;
  matchRule: string;
  matchEvidence: string;
  suggestedAt: string;
  message: { id: string; subject: string; receivedAt: string; gmailLink: string } | null;
  opportunity: { id: string; track: string; company: string; roleTitle: string } | null;
};

async function hydrate(rows: { id: string; status: string; match_rule: string; match_evidence: string; suggested_at: string; gmail_message_id: string; opportunity_id: string }[]) {
  if (rows.length === 0) return [] as LinkView[];
  const supabase = await createClient();
  const [messages, opportunities] = await Promise.all([
    supabase.from("gmail_messages").select("id,subject,received_at,gmail_link").in("id", [...new Set(rows.map((row) => row.gmail_message_id))]),
    supabase.from("opportunities").select("id,track,company,role_title").in("id", [...new Set(rows.map((row) => row.opportunity_id))])
  ]);
  if (messages.error) throw messages.error;
  if (opportunities.error) throw opportunities.error;
  const messageById = new Map((messages.data ?? []).map((row) => [row.id, row]));
  const opportunityById = new Map((opportunities.data ?? []).map((row) => [row.id, row]));
  return rows.map((row): LinkView => {
    const message = messageById.get(row.gmail_message_id);
    const opportunity = opportunityById.get(row.opportunity_id);
    return {
      id: row.id, status: row.status, matchRule: row.match_rule, matchEvidence: row.match_evidence, suggestedAt: row.suggested_at,
      message: message ? { id: message.id, subject: message.subject || "（无主题邮件）", receivedAt: message.received_at, gmailLink: message.gmail_link } : null,
      opportunity: opportunity ? { id: opportunity.id, track: opportunity.track, company: opportunity.company, roleTitle: opportunity.role_title } : null
    };
  });
}

const linkColumns = "id,status,match_rule,match_evidence,suggested_at,gmail_message_id,opportunity_id";

export async function getLinkSuggestions(user: AppUser): Promise<LinkView[]> {
  if (user.isMock) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity_communications").select(linkColumns)
    .eq("status", "suggested").order("suggested_at", { ascending: false }).limit(50);
  if (error) throw error;
  return hydrate(data ?? []);
}

export async function getOpportunityCommunications(user: AppUser, opportunityId: string): Promise<LinkView[]> {
  if (user.isMock) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("opportunity_communications").select(linkColumns)
    .eq("opportunity_id", opportunityId).in("status", ["linked", "suggested"]).order("suggested_at", { ascending: false }).limit(50);
  if (error) throw error;
  return hydrate(data ?? []);
}
