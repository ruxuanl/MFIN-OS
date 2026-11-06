"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import type { GrantMode } from "@/lib/permissions/model";
import { createClient } from "@/lib/supabase/server";

const configurableModes = new Set<GrantMode>(["off", "temporary", "persistent"]);
const jobSourceActions = new Set(["approve", "reject", "enable", "disable"]);

function jobSourceErrorNotice(message: string) {
  if (message.includes("privacy_locked")) return "job_source_privacy_locked";
  if (message.includes("job_discovery_permission_denied")) return "job_source_permission_required";
  if (message.includes("job_source_not_approved")) return "job_source_approval_required";
  return "job_source_failed";
}

export async function reviewJobSource(formData: FormData) {
  const user = await requireUser();
  if (user.isMock) redirect("/status?notice=preview");

  const sourceId = String(formData.get("sourceId") ?? "");
  const action = String(formData.get("action") ?? "");
  const pollingIntervalMinutes = Number(formData.get("pollingIntervalMinutes"));
  if (!sourceId || !jobSourceActions.has(action)
    || !Number.isInteger(pollingIntervalMinutes)
    || pollingIntervalMinutes < 60
    || pollingIntervalMinutes > 10080) {
    redirect("/status?notice=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_my_job_source", {
    target_action: action,
    target_polling_interval_minutes: pollingIntervalMinutes,
    target_source_id: sourceId
  });
  if (error) redirect(`/status?notice=${jobSourceErrorNotice(error.message)}`);
  revalidatePath("/status");
  const noticeByAction = {
    approve: "job_source_approved",
    reject: "job_source_rejected",
    enable: "job_source_enabled",
    disable: "job_source_disabled"
  } as const;
  redirect(`/status?notice=${noticeByAction[action as keyof typeof noticeByAction]}`);
}

export async function setCapabilityGrant(formData: FormData) {
  const user = await requireUser();
  if (user.isMock) redirect("/status?notice=preview");

  const capabilityKey = String(formData.get("capabilityKey") ?? "");
  const mode = String(formData.get("mode") ?? "") as GrantMode;
  if (!capabilityKey || capabilityKey.startsWith("wechat.") || !configurableModes.has(mode)) redirect("/status?notice=invalid");

  const supabase = await createClient();
  const now = new Date();
  const expiresAt = mode === "temporary"
    ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
    : null;
  const { error } = await supabase.from("permission_grants").upsert(
    {
      user_id: user.id,
      capability_key: capabilityKey,
      mode,
      operation_id: null,
      starts_at: now.toISOString(),
      expires_at: expiresAt,
      active: mode !== "off"
    },
    { onConflict: "user_id,capability_key" }
  );

  if (error) redirect("/status?notice=permission_failed");
  revalidatePath("/status");
  redirect("/status?notice=permission_saved");
}

export async function setPrivacyLock(formData: FormData) {
  const user = await requireUser();
  if (user.isMock) redirect("/status?notice=preview");

  const intent = String(formData.get("intent") ?? "");
  const supabase = await createClient();

  if (intent === "lock") {
    const { error } = await supabase.from("privacy_locks").upsert(
      { user_id: user.id, is_locked: true, reason_code: "user_requested" },
      { onConflict: "user_id" }
    );
    if (error) redirect("/status?notice=lock_failed");
    revalidatePath("/status");
    redirect("/status?notice=locked");
  }

  if (intent === "unlock") {
    const { error } = await supabase
      .from("privacy_locks")
      .update({ is_locked: false, reason_code: null })
      .eq("user_id", user.id);
    if (error) redirect("/status?notice=reauth_required");
    revalidatePath("/status");
    redirect("/status?notice=unlocked");
  }

  redirect("/status?notice=invalid");
}
