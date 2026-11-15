"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export async function changeMailTask(input: { itemId: string; actionId: string | null; version: number; status: string }) {
  const user = await requireUser();
  if (user.isMock) return { error: "预览模式没有可保存的数据。" };
  if (!/^[0-9a-f-]{36}$/i.test(input.itemId) || !["unscheduled", "waiting", "completed", "cancelled"].includes(input.status)) return { error: "无效操作。" };
  const db = await createClient();
  const { data: item, error: itemError } = await db.from("inbox_items").select("id,action_id,status,item_type,gmail_message_id").eq("id", input.itemId).eq("user_id", user.id).maybeSingle();
  if (itemError || !item || item.action_id !== input.actionId) return { error: "数据已变化，请刷新后重试。" };
  if (!item.action_id) {
    if (item.status !== "pending" || !["email_action", "email_update"].includes(item.item_type)) return { error: "请在收件箱处理此邮件。" };
    if (item.item_type === "email_update") {
      const { data: message, error } = await db.from("gmail_messages").select("needs_action").eq("id", item.gmail_message_id ?? "").eq("user_id", user.id).maybeSingle();
      if (error || !message?.needs_action) return { error: "此邮件没有明确待办，请在收件箱检查证据。" };
    }
    const { error } = await db.rpc("resolve_my_inbox_item", { target_item_id: item.id, target_resolution: input.status === "cancelled" ? "dismiss" : "accept" });
    if (error) return { error: "保存失败，请检查隐私锁或连接状态。" };
    // Extraction is an explicit confirmation step. Further progress is saved
    // against the freshly created action after a refresh, avoiding stale writes.
  } else {
    const { data: current, error } = await db.from("actions").select("status,version,completed_at,cancelled_at").eq("id", item.action_id).eq("user_id", user.id).single();
    if (error || !current || current.version !== input.version) return { error: "行动已被修改，请刷新后重试。" };
    const patch = { status: input.status };
    const { data: result, error: saveError } = await db.rpc("apply_workspace_mutation", {
      target_mutation_id: crypto.randomUUID(), target_device_id: "dashboard-server", target_object_type: "action", target_object_id: item.action_id,
      target_base_version: current.version, target_base_values: { status: current.status } as Json, target_patch: patch as Json
    });
    if (saveError || (result && typeof result === "object" && !Array.isArray(result) && Number(result.conflictCount ?? 0) > 0)) return { error: "保存失败或存在冲突，请刷新并检查隐私锁。" };
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/inbox");
  revalidatePath("/");
  return { error: null };
}
