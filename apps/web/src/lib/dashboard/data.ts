import "server-only";

import type { AppUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { buildAnalytics, type Application, type DashboardInput, type MailTask } from "./model";

// Exhaust every page: PostgREST's default row limit must not become a KPI limit.
export async function readAll<T>(read: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await read(offset, offset + 499);
    if (error) throw new Error("dashboard_data_unavailable");
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
}

export async function getDashboard(user: AppUser) {
  const now = Date.now();
  const empty: DashboardInput = { applications: [], events: [], mail: [], tasks: [] };
  if (user.isMock) return { ...empty, analytics: buildAnalytics(empty, now), asOf: new Date(now).toISOString(), connection: null };
  const db = await createClient();
  const [applications, events, messages, insights, items, actions, connection] = await Promise.all([
    readAll((from, to) => db.from("opportunities").select("id,company,role_title,department,main_stage,substage,applied_at,close_reason,record_state,parser_version").eq("user_id", user.id).eq("track", "internship").neq("record_state", "trashed").order("id").range(from, to)),
    readAll((from, to) => db.from("timeline_entries").select("id,entity_id,occurred_at,summary,event_type,changes").eq("user_id", user.id).eq("entity_type", "opportunity").order("id").range(from, to)),
    readAll((from, to) => db.from("gmail_messages").select("id,received_at,subject,sender_summary,gmail_link,needs_action,action_due_at,classification,summary").eq("user_id", user.id).not("provider_message_id", "like", "seed-%").order("id").range(from, to)),
    readAll((from, to) => db.from("inbox_mail_view").select("id,priority,summary").eq("user_id", user.id).order("id").range(from, to)),
    readAll((from, to) => db.from("inbox_items").select("id,gmail_message_id,title,item_type,status,action_id").eq("user_id", user.id).order("id").range(from, to)),
    readAll((from, to) => db.from("actions").select("id,title,status,due_at,priority,version").eq("user_id", user.id).order("id").range(from, to)),
    db.from("external_connections").select("status,last_success_at,last_error_code").eq("user_id", user.id).eq("provider", "gmail").maybeSingle()
  ]);
  if (connection.error) throw new Error("dashboard_data_unavailable");
  const insightMap = new Map(insights.map((item) => [item.id, item]));
  const changeIds = new Set(items.filter((item) => item.item_type === "email_update").map((item) => item.gmail_message_id));
  const mail = messages.map((item) => ({ ...item, recruitmentChange: changeIds.has(item.id), priority: insightMap.get(item.id)?.priority ?? null, summary: insightMap.get(item.id)?.summary ?? item.summary }));
  const mailMap = new Map(mail.map((item) => [item.id, item]));
  const actionMap = new Map(actions.map((item) => [item.id, item]));
  const seenActions = new Set<string>();
  const tasks: MailTask[] = items.flatMap((item) => {
    if (!item.gmail_message_id) return [];
    const message = mailMap.get(item.gmail_message_id);
    if (!message || (item.item_type !== "email_action" && !(item.item_type === "email_update" && message.needs_action) && !item.action_id)) return [];
    const action = item.action_id ? actionMap.get(item.action_id) : null;
    if (item.action_id && !action) return []; // Never recreate a removed action.
    if (action && seenActions.has(action.id)) return [];
    if (action) seenActions.add(action.id);
    return [{ id: action?.id ?? item.id, itemId: item.id, messageId: message.id, title: action?.title ?? item.title,
      actionId: action?.id ?? null, status: action?.status ?? (item.status === "dismissed" ? "dismissed" : "unscheduled"),
      dueAt: action ? action.due_at : message.action_due_at, priority: action?.priority ?? (message.priority === "important" ? "high" : "normal"), version: action?.version ?? 0 }];
  });
  const input = { applications: applications as Application[], events, mail, tasks };
  return { ...input, analytics: buildAnalytics(input, now), asOf: new Date(now).toISOString(), connection: connection.data };
}
export type DashboardData = Awaited<ReturnType<typeof getDashboard>>;
