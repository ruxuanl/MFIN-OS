"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasFreshReauthentication, requireUser } from "@/lib/auth/session";
import { getGmailOAuthConfig, isGmailServerConfigured } from "@/lib/config";
import { safeGmailErrorCode } from "@/lib/gmail/errors";
import { deleteImportedGmailAttachment, disconnectGmail, runGmailSync } from "@/lib/gmail/service";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export async function triggerGmailSync() {
  const user = await requireUser();
  if (user.isMock || !isGmailServerConfigured()) redirect("/inbox?notice=not_configured");
  let complete = false;
  let needsConfirmation = false;
  try {
    const result = await runGmailSync(user.id, getGmailOAuthConfig());
    complete = result.complete;
    needsConfirmation = Boolean(result.needsConfirmation);
  } catch (error) {
    const code = safeGmailErrorCode(error);
    console.error("[gmail-sync]", code);
    const service = createServiceClient();
    await service.from("external_connections").update({
      last_error_code: code,
      last_error_at: new Date().toISOString()
    }).eq("user_id", user.id).eq("provider", "gmail");
    redirect("/inbox?notice=sync_failed");
  }
  revalidatePath("/inbox"); revalidatePath("/status"); redirect(complete ? "/inbox?notice=synced" : needsConfirmation ? "/inbox?notice=backfill_confirmation_required" : "/inbox?notice=sync_partial");
}
export async function setGmailConnectionState(formData: FormData) {
  const user = await requireUser();
  const status = String(formData.get("status") ?? "");
  if (user.isMock || !["connected", "paused"].includes(status)) redirect("/inbox?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_gmail_connection_status", { target_status: status });
  if (error) redirect("/inbox?notice=connection_state_failed");
  revalidatePath("/inbox"); revalidatePath("/status"); redirect(`/inbox?notice=${status === "paused" ? "paused" : "resumed"}`);
}

export async function disconnectGmailAction() {
  const user = await requireUser();
  if (user.isMock || !isGmailServerConfigured()) redirect("/inbox?notice=not_configured");
  if (!(await hasFreshReauthentication())) redirect("/inbox?notice=reauth_required");
  let remoteRevoked = false;
  try { ({ remoteRevoked } = await disconnectGmail(user.id)); } catch { redirect("/inbox?notice=disconnect_failed"); }
  revalidatePath("/inbox"); revalidatePath("/status");
  redirect(`/inbox?notice=${remoteRevoked ? "disconnected" : "disconnected_revoke_failed"}`);
}

export async function resolveInboxItemAction(formData: FormData) {
  await requireUser();
  const itemId = String(formData.get("itemId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  if (!itemId || !["accept", "dismiss"].includes(resolution)) redirect("/inbox?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_my_inbox_item", { target_item_id: itemId, target_resolution: resolution });
  if (error) redirect("/inbox?notice=resolve_failed");
  revalidatePath("/inbox"); redirect("/inbox?notice=resolved");
}

export async function undoGmailUpdateAction(formData: FormData) {
  await requireUser();
  const updateId = String(formData.get("updateId") ?? "");
  if (!updateId) redirect("/inbox?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_my_gmail_update", { target_update_id: updateId });
  if (error) redirect("/inbox?notice=undo_failed");
  revalidatePath("/inbox"); redirect("/inbox?notice=undone");
}

export async function deleteGmailAttachmentAction(formData: FormData) {
  const user = await requireUser();
  const attachmentId = String(formData.get("attachmentId") ?? "");
  if (!attachmentId) redirect("/inbox?notice=invalid");
  try { await deleteImportedGmailAttachment(user.id, attachmentId); } catch { redirect("/inbox?notice=attachment_delete_failed"); }
  revalidatePath("/inbox"); redirect("/inbox?notice=attachment_deleted");
}
