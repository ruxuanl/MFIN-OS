"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { hasFreshReauthentication, requireUser } from "@/lib/auth/session";
import { getCalendarSyncNotice, parseCalendarDateTimeLocal } from "@/lib/calendar/model";
import { disconnectCalendar, runCalendarSync } from "@/lib/calendar/service";
import { calendarFailureNotice } from "@/lib/calendar/errors";
import { getCalendarOAuthConfig, isCalendarServerConfigured } from "@/lib/config";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const actionPriorities = new Set(["low", "normal", "high", "critical"]);

function formText(formData: FormData, key: string, maxLength: number, required = false) {
  const value = String(formData.get(key) ?? "").trim();
  if ((required && !value) || value.length > maxLength) throw new Error(`invalid_${key}`);
  return value || null;
}

export async function updatePersonalCalendarAction(formData: FormData) {
  const user = await requireUser();
  const actionId = String(formData.get("actionId") ?? "");
  if (user.isMock || !actionId) redirect("/calendar?notice=invalid");

  try {
    const title = formText(formData, "title", 300, true);
    const estimateText = formText(formData, "estimatedMinutes", 8);
    const estimatedMinutes = estimateText ? Number(estimateText) : null;
    const priority = String(formData.get("priority") ?? "normal");
    if (!Number.isInteger(estimatedMinutes) && estimatedMinutes !== null) throw new Error("invalid_estimatedMinutes");
    if (estimatedMinutes !== null && (estimatedMinutes < 1 || estimatedMinutes > 10080)) throw new Error("invalid_estimatedMinutes");
    if (!actionPriorities.has(priority)) throw new Error("invalid_priority");

    const supabase = await createClient();
    const { data: current, error: readError } = await supabase.from("actions")
      .select("id,version,title,due_at,suggested_start_at,estimated_minutes,priority,completion_criteria")
      .eq("id", actionId)
      .eq("user_id", user.id)
      .eq("context_type", "personal")
      .maybeSingle();
    if (readError || !current) throw readError ?? new Error("personal_action_not_found");

    const patch = {
      title,
      due_at: parseCalendarDateTimeLocal(String(formData.get("dueAt") ?? "")),
      suggested_start_at: parseCalendarDateTimeLocal(String(formData.get("suggestedStartAt") ?? "")),
      estimated_minutes: estimatedMinutes,
      priority,
      completion_criteria: formText(formData, "completionCriteria", 1000)
    };
    const baseValues = {
      title: current.title,
      due_at: current.due_at,
      suggested_start_at: current.suggested_start_at,
      estimated_minutes: current.estimated_minutes,
      priority: current.priority,
      completion_criteria: current.completion_criteria
    };
    const { data: result, error } = await supabase.rpc("apply_workspace_mutation", {
      target_mutation_id: crypto.randomUUID(),
      target_device_id: "calendar-web-server",
      target_object_type: "action",
      target_object_id: actionId,
      target_base_version: current.version,
      target_base_values: baseValues as Json,
      target_patch: patch as Json
    });
    if (error) throw error;
    const resultObject = result && typeof result === "object" && !Array.isArray(result)
      ? result as Record<string, Json | undefined>
      : null;
    const conflictCount = Number(resultObject?.conflictCount ?? 0);
    const appliedFields = Array.isArray(resultObject?.appliedFields) ? resultObject.appliedFields.length : 0;
    revalidatePath("/calendar");
    if (conflictCount > 0) redirect("/calendar?notice=action_update_conflict");
    redirect(`/calendar?notice=${appliedFields > 0 ? "action_updated" : "action_unchanged"}`);
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    redirect("/calendar?notice=action_update_failed");
  }
}

export async function queueCalendarAction(formData: FormData) {
  const user = await requireUser();
  const actionId = String(formData.get("actionId") ?? "");
  const allDay = String(formData.get("allDay") ?? "false") === "true";
  if (user.isMock || !actionId) redirect("/calendar?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("queue_action_calendar_sync", {
    target_action_id: actionId,
    target_all_day: allDay
  });
  if (error) redirect(`/calendar?notice=${error.message.includes("requires") ? "schedule_required" : "queue_failed"}`);
  revalidatePath("/calendar");
  redirect("/calendar?notice=queued");
}

export async function triggerCalendarSync() {
  const user = await requireUser();
  if (user.isMock || !isCalendarServerConfigured()) redirect("/calendar?notice=not_configured");
  let notice = "synced";
  try {
    const result = await runCalendarSync(
      user.id,
      getCalendarOAuthConfig(),
      process.env.APP_BASE_URL ?? "http://localhost:3000"
    );
    notice = getCalendarSyncNotice(result.pendingOperations, result.conflicts);
  } catch (error) {
    const code = calendarFailureNotice(error);
    redirect(`/calendar?notice=${code}`);
  }
  revalidatePath("/calendar");
  revalidatePath("/status");
  redirect(`/calendar?notice=${notice}`);
}

export async function setCalendarConnectionState(formData: FormData) {
  const user = await requireUser();
  const status = String(formData.get("status") ?? "");
  if (user.isMock || !["connected", "paused"].includes(status)) redirect("/calendar?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_calendar_connection_status", { target_status: status });
  if (error) redirect("/calendar?notice=connection_state_failed");
  revalidatePath("/calendar");
  revalidatePath("/status");
  redirect(`/calendar?notice=${status === "paused" ? "paused" : "resumed"}`);
}

export async function disconnectCalendarAction() {
  const user = await requireUser();
  if (user.isMock || !isCalendarServerConfigured()) redirect("/calendar?notice=not_configured");
  if (!(await hasFreshReauthentication())) redirect("/calendar?notice=reauth_required");
  let remoteRevoked: boolean;
  try {
    ({ remoteRevoked } = await disconnectCalendar(user.id));
  } catch {
    redirect("/calendar?notice=disconnect_failed");
  }
  revalidatePath("/calendar");
  revalidatePath("/status");
  redirect(`/calendar?notice=${remoteRevoked ? "disconnected" : "disconnected_revoke_failed"}`);
}

export async function resolveCalendarConflictAction(formData: FormData) {
  const user = await requireUser();
  const conflictId = String(formData.get("conflictId") ?? "");
  const resolution = String(formData.get("resolution") ?? "");
  if (user.isMock || !conflictId) redirect("/calendar?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_calendar_sync_conflict", {
    target_conflict_id: conflictId,
    target_resolution: resolution
  });
  if (error) redirect("/calendar?notice=conflict_failed");
  revalidatePath("/calendar");
  redirect("/calendar?notice=conflict_resolved");
}
