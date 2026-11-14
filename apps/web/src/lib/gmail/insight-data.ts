import "server-only";
import type { AppUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { MailCategory, MailPriority } from "./insight-model";
import type { MailboxView } from "./insight-types";
export async function getMailbox(user: AppUser,category?: MailCategory,priority?: MailPriority,page=1): Promise<MailboxView> {
  if (user.isMock) return { counts: [],total: 0,unfinished: 0,queued: 0,messages: [] };
  const client = await createClient();
  const { data,error } = await client.rpc("read_my_mailbox",{ target_category: category,target_priority: priority,target_page: page });
  if (error) throw error;
  return data as unknown as MailboxView;
}
export async function getMailDetail(user: AppUser,id: string) {
  if (user.isMock || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const client = await createClient();
  const [mail,items,attachments,communications] = await Promise.all([
    client.from("inbox_mail_view").select("*").eq("id",id).eq("user_id",user.id).maybeSingle(),
    client.from("inbox_items").select("*").eq("gmail_message_id",id).eq("user_id",user.id),
    client.from("gmail_attachments").select("*").eq("gmail_message_id",id).eq("user_id",user.id),
    client.from("opportunity_communications").select("id,status,opportunity_id").eq("gmail_message_id",id).eq("user_id",user.id).in("status",["suggested","linked"])
  ]);
  const error = [mail,items,attachments,communications].find(r=>r.error)?.error;
  if (error) throw error;
  if (!mail.data) return null;
  const [updates,opportunities] = await Promise.all([
    items.data?.length ? client.from("gmail_updates").select("*").in("inbox_item_id",items.data.map(x=>x.id)).eq("user_id",user.id).eq("status","applied") : Promise.resolve({ data: [],error: null }),
    communications.data?.length ? client.from("opportunities").select("id,company,role_title,track").in("id",communications.data.map(x=>x.opportunity_id)).eq("user_id",user.id) : Promise.resolve({ data: [],error: null })
  ]);
  if (updates.error) throw updates.error;
  if (opportunities.error) throw opportunities.error;
  return { mail: mail.data,items: items.data ?? [],attachments: attachments.data ?? [],updates: updates.data ?? [],
    links: (communications.data ?? []).map(link=>({ ...link,opportunity: opportunities.data?.find(x=>x.id===link.opportunity_id) })) };
}
export async function getMailboxConnection(user: AppUser) {
  if (user.isMock) return null;
  const client = await createClient();
  const { data,error } = await client.from("external_connections").select("status,last_success_at,last_error_code").eq("provider","gmail").eq("user_id",user.id).maybeSingle();
  if (error) throw error;
  return data;
}
