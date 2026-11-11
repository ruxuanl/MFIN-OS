import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type GmailMessage = Tables["gmail_messages"]["Row"];
export type InboxItem = Tables["inbox_items"]["Row"];
export type GmailAttachment = Tables["gmail_attachments"]["Row"];
export type GmailUpdate = Tables["gmail_updates"]["Row"];
export type WeChatProjection = Tables["wechat_projections"]["Row"];
export type WeChatScreenshotIntake = Tables["wechat_screenshot_intakes"]["Row"];

export type InboxData = {
  isMock: boolean;
  connection: { status: string; grantedScopes: string[]; lastSuccessAt: string | null; lastErrorCode: string | null } | null;
  messages: GmailMessage[];
  items: InboxItem[];
  attachments: GmailAttachment[];
  updates: GmailUpdate[];
  wechatProjections: WeChatProjection[];
  screenshotIntakes: WeChatScreenshotIntake[];
};

export async function getInboxData(user: AppUser): Promise<InboxData> {
  if (user.isMock) return {
    isMock: true, connection: null, messages: [], items: [], attachments: [], updates: [],
    wechatProjections: [], screenshotIntakes: []
  };
  const supabase = await createClient();
  const [connection, messages, items, attachments, updates, wechatProjections, screenshotIntakes] = await Promise.all([
    supabase.from("external_connections").select("status,granted_scopes,last_success_at,last_error_code")
      .eq("provider", "gmail").maybeSingle(),
    supabase.from("gmail_messages").select("*").order("received_at", { ascending: false }).limit(100),
    supabase.from("inbox_items").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("gmail_attachments").select("*").order("created_at", { ascending: false }).limit(100),
    supabase.from("gmail_updates").select("*").eq("status", "applied").order("applied_at", { ascending: false }),
    supabase.from("wechat_projections").select("*").order("captured_at", { ascending: false }).limit(100),
    supabase.from("wechat_screenshot_intakes").select("*").order("created_at", { ascending: false }).limit(20)
  ]);
  const error = [connection, messages, items, attachments, updates, wechatProjections, screenshotIntakes]
    .map((result) => result.error).find(Boolean);
  if (error) throw error;
  return {
    isMock: false,
    connection: connection.data ? {
      status: connection.data.status,
      grantedScopes: connection.data.granted_scopes,
      lastSuccessAt: connection.data.last_success_at,
      lastErrorCode: connection.data.last_error_code
    } : null,
    messages: messages.data ?? [], items: items.data ?? [],
    attachments: attachments.data ?? [], updates: updates.data ?? [],
    wechatProjections: wechatProjections.data ?? [], screenshotIntakes: screenshotIntakes.data ?? []
  };
}
