"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { isReportType } from "@/lib/reports/model";
import { createClient } from "@/lib/supabase/server";
import { generateBrief, saveSchedule } from "@/lib/reports/archive";

export async function generateArchiveAction(formData: FormData) {
  const user=await requireUser();
  const type=formData.get("type");
  if(user.isMock || (type!=="daily" && type!=="weekly"))redirect("/review?notice=generate_failed");
  let id:string;
  try {id=(await generateBrief(user.id,type)).id;}
  catch {redirect(`/review?type=${type}&notice=generate_failed`);}
  revalidatePath("/review");
  redirect(`/review?type=${type}&id=${id}&notice=generated`);
}
export async function saveArchiveSchedule(formData: FormData) {
  const user=await requireUser(); const type=formData.get("type");
  if(user.isMock || (type!=="daily" && type!=="weekly"))redirect("/review?notice=schedule_failed");
  try {await saveSchedule(user.id,{type,enabled:formData.get("enabled")==="on",time:String(formData.get("time")??"")});}
  catch {redirect("/review?notice=schedule_failed");}
  revalidatePath("/review");redirect("/review?notice=schedule_saved");
}

export async function markReportNotificationsRead() {
  const user = await requireUser();
  if (user.isMock) return { updated: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null)
    .select("id");
  if (error) {
    console.error("[notifications] read receipt failed");
    return { updated: 0 };
  }
  revalidatePath("/review");
  return { updated: data.length };
}

export async function generateReportAction(formData: FormData) {
  const user = await requireUser();
  const reportType = String(formData.get("reportType") ?? "");
  const returnTo = formData.get("returnTo") === "/review" ? "/review" : "/";
  if (user.isMock || !isReportType(reportType)) redirect(`${returnTo}?notice=invalid`);
  try { await generateBrief(user.id,reportType === "weekly" ? "weekly" : "daily"); }
  catch { redirect("/review?notice=generate_failed"); }
  revalidatePath("/");
  revalidatePath("/review");
  redirect(`/review?type=${reportType === "weekly" ? "weekly" : "daily"}&notice=generated`);
}

export async function updateReportSchedule(formData: FormData) {
  const user = await requireUser();
  const reportType = String(formData.get("reportType") ?? "");
  const localTime = String(formData.get("localTime") ?? "");
  const enabled = formData.get("enabled") === "on";
  if (user.isMock || !isReportType(reportType) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(localTime)) redirect("/review?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_my_report_schedule", {
    target_report_type: reportType,
    target_enabled: enabled,
    target_local_time: localTime
  });
  if (error) redirect("/review?notice=schedule_failed");
  revalidatePath("/");
  revalidatePath("/review");
  redirect("/review?notice=schedule_saved");
}

export async function closeOutAction(formData: FormData) {
  const user = await requireUser();
  const actionId = String(formData.get("actionId") ?? "");
  const outcome = String(formData.get("outcome") ?? "");
  const rescheduleAt = String(formData.get("rescheduleAt") ?? "");
  const outcomes = new Set(["completed", "continue", "waiting", "cancelled", "downgraded", "rescheduled"]);
  if (user.isMock || !actionId || !outcomes.has(outcome)) redirect("/review?notice=invalid");
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_out_my_action", {
    target_action_id: actionId,
    target_outcome: outcome,
    target_reschedule_at: outcome === "rescheduled" && rescheduleAt ? new Date(rescheduleAt).toISOString() : undefined
  });
  if (error) redirect(`/review?notice=${error.message.includes("required") ? "reschedule_required" : "closeout_failed"}`);
  revalidatePath("/");
  revalidatePath("/review");
  redirect("/review?notice=closeout_saved");
}
