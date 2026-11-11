"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  buildChecklist,
  officialApplyUrl,
  packageRuleVersion,
  recommendResume,
  suggestedStartDate
} from "@/lib/applications/package-rules";
import { getResumeOptions } from "@/lib/applications/data";
import { requireUser } from "@/lib/auth/session";
import { isResumeWorkspaceEnabled } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

// These actions only change records inside this product. None of them opens an
// employer site, fills a form, signs in, sends a message or submits anything.

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function detailPath(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "");
  return /^\/(internships|graduate)\/[0-9a-f-]{36}$/i.test(returnTo) ? returnTo : "/internships";
}

function failureNotice(message: string | undefined) {
  const text = (message ?? "").toLocaleLowerCase("en-US");
  return text.includes("privacy_locked") ? "privacy_locked" : "package_failed";
}

function hongKongToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
}

export async function createApplicationPackage(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!uuidPattern.test(opportunityId)) redirect(`${back}?notice=package_failed`);

  const supabase = await createClient();
  const { data: opportunity, error } = await supabase.from("opportunities")
    .select("id,deadline,source_url,application_method,raw_jd,requirements,responsibilities")
    .eq("id", opportunityId).maybeSingle();
  if (error || !opportunity) redirect(`${back}?notice=package_failed`);

  const jdText = [opportunity.raw_jd, opportunity.requirements, opportunity.application_method].filter(Boolean).join("\n");
  const items = buildChecklist(jdText);
  const resumes = isResumeWorkspaceEnabled()
    ? await getResumeOptions(opportunityId)
    : { options: [], assignedResumeVersionId: null };
  const recommendation = recommendResume(resumes.options, resumes.assignedResumeVersionId);
  const requiredCount = items.filter((item) => item.required && item.source === "jd_rule").length;

  const { error: rpcError } = await supabase.rpc("create_my_application_package", {
    target_opportunity_id: opportunityId,
    target_items: items,
    target_recommended_resume_version_id: recommendation.versionId as string,
    target_recommendation_reason: isResumeWorkspaceEnabled() ? recommendation.reason : "材料库未启用；请在本地记录将使用的简历版本。",
    target_official_apply_url: officialApplyUrl(opportunity.source_url, opportunity.application_method, opportunity.raw_jd) as string,
    target_suggested_start_on: suggestedStartDate(opportunity.deadline, hongKongToday(), requiredCount) as string,
    target_rule_version: packageRuleVersion
  });
  if (rpcError) redirect(`${back}?notice=${failureNotice(rpcError.message)}`);
  revalidatePath(back);
  redirect(`${back}?notice=package_created`);
}

export async function confirmPackageResume(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const packageId = String(formData.get("packageId") ?? "");
  const versionId = String(formData.get("resumeVersionId") ?? "");
  if (!uuidPattern.test(packageId) || !uuidPattern.test(versionId)) redirect(`${back}?notice=package_failed`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_my_application_package_resume", {
    target_package_id: packageId,
    target_resume_version_id: versionId
  });
  if (error) redirect(`${back}?notice=${failureNotice(error.message)}`);
  revalidatePath(back);
  redirect(`${back}?notice=package_resume_confirmed`);
}

export async function setPackageItem(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const itemId = String(formData.get("itemId") ?? "");
  if (!uuidPattern.test(itemId)) redirect(`${back}?notice=package_failed`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_application_package_item", {
    target_item_id: itemId,
    target_done: String(formData.get("done")) === "true"
  });
  if (error) redirect(`${back}?notice=${failureNotice(error.message)}`);
  revalidatePath(back);
  redirect(back);
}

export async function setPackageStatus(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const packageId = String(formData.get("packageId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!uuidPattern.test(packageId) || !["draft", "ready", "abandoned"].includes(status)) {
    redirect(`${back}?notice=package_failed`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_application_package_status", {
    target_package_id: packageId,
    target_status: status
  });
  if (error) redirect(`${back}?notice=${failureNotice(error.message)}`);
  revalidatePath(back);
  redirect(`${back}?notice=package_status_saved`);
}

export async function recordApplicationSubmitted(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const submittedOn = String(formData.get("submittedOn") ?? "").trim();
  const reference = String(formData.get("applicationReference") ?? "").trim();
  const answers = String(formData.get("answersText") ?? "").trim();
  if (!uuidPattern.test(opportunityId) || (submittedOn && !/^\d{4}-\d{2}-\d{2}$/.test(submittedOn))
    || reference.length > 200 || answers.length > 20000) {
    redirect(`${back}?notice=submission_failed`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("record_my_application_submitted", {
    target_opportunity_id: opportunityId,
    target_submitted_on: (submittedOn || null) as string,
    target_application_reference: (reference || null) as string,
    target_answers_text: (answers || null) as string
  });
  if (error) {
    const text = error.message.toLocaleLowerCase("en-US");
    const notice = text.includes("privacy_locked") ? "privacy_locked"
      : text.includes("already") ? "submission_exists"
        : "submission_failed";
    redirect(`${back}?notice=${notice}`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=submission_recorded`);
}

export async function undoApplicationSubmitted(formData: FormData) {
  const user = await requireUser();
  const back = detailPath(formData);
  if (user.isMock) redirect(`${back}?notice=preview`);
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!uuidPattern.test(snapshotId)) redirect(`${back}?notice=submission_undo_failed`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("undo_my_application_submitted", { target_snapshot_id: snapshotId });
  if (error) {
    const text = error.message.toLocaleLowerCase("en-US");
    redirect(`${back}?notice=${text.includes("changed_since") ? "submission_undo_stale"
      : text.includes("privacy_locked") ? "privacy_locked" : "submission_undo_failed"}`);
  }
  revalidatePath(back);
  redirect(`${back}?notice=submission_undone`);
}
