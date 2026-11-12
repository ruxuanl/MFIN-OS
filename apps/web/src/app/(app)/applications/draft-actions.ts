"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { applicationPackPromptVersion, buildPackPayload, fingerprintSource, packReserveHkdCents, parseQuestions } from "@/lib/ai/application-pack";
import { generateApplicationPack } from "@/lib/ai/openai-analysis";
import { requireUser } from "@/lib/auth/session";
import { getOpenAiConfig, isOpenAiConfigured } from "@/lib/config";
import { loadResumeText } from "@/lib/resumes/text";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// Drafts only (#15, D29). Nothing here opens an employer site, fills a form, sends or submits.

function detailPath(formData: FormData) {
  const returnTo = String(formData.get("returnTo") ?? "");
  return /^\/(internships|graduate)\/[0-9a-f-]{36}$/i.test(returnTo) ? returnTo : "/internships";
}

function packNotice(error: unknown) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase("en-US") : "";
  if (message.includes("draft_resume_unconfirmed")) return "draft_resume_unconfirmed";
  if (message.includes("budget")) return "ai_budget_exceeded";
  if (message.includes("privacy_locked")) return "privacy_locked";
  if (message.includes("permission")) return "draft_permission_required";
  if (message.includes("pack_jd_required")) return "draft_jd_required";
  if (message.includes("pack_resume_text_required") || message.includes("resume")) return "draft_resume_unavailable";
  return "draft_ai_failed";
}

export async function generateApplicationDrafts(formData: FormData) {
  const user = await requireUser();
  const returnTo = detailPath(formData);
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (user.isMock || !opportunityId) redirect(`${returnTo}?notice=invalid`);
  if (!isOpenAiConfigured()) redirect(`${returnTo}?notice=ai_not_configured`);

  const supabase = await createClient();
  let usageId: string | null = null;
  let outcome = "drafts_generated";
  try {
    const [opportunity, pack] = await Promise.all([
      supabase.from("opportunities").select("company,role_title,raw_jd,responsibilities,requirements").eq("id", opportunityId).maybeSingle(),
      supabase.from("application_packages").select("selected_resume_version_id").eq("opportunity_id", opportunityId).maybeSingle()
    ]);
    if (opportunity.error || !opportunity.data) throw new Error("opportunity_not_found");
    const versionId = pack.data?.selected_resume_version_id;
    if (!versionId) throw new Error("draft_resume_unconfirmed");

    const jdText = opportunity.data.raw_jd
      ?? [opportunity.data.responsibilities, opportunity.data.requirements].filter(Boolean).join("\n\n");
    const payload = buildPackPayload({
      company: opportunity.data.company,
      roleTitle: opportunity.data.role_title,
      jdText: jdText ?? "",
      resumeVersionId: versionId,
      resumeText: await loadResumeText(versionId),
      questions: parseQuestions(String(formData.get("questions") ?? ""))
    });
    const fingerprint = createHash("sha256").update(fingerprintSource(payload)).digest("hex");

    const cached = await supabase.from("ai_analyses").select("id").eq("analysis_kind", "application_pack")
      .eq("input_fingerprint", fingerprint).eq("prompt_version", applicationPackPromptVersion).maybeSingle();
    if (cached.data) {
      const applied = await supabase.rpc("apply_my_application_pack", { target_analysis_id: cached.data.id });
      if (applied.error) throw new Error(applied.error.message);
      outcome = "drafts_cached";
    } else {
      const config = getOpenAiConfig();
      const reserveCents = packReserveHkdCents(payload, config);
      const reservation = await supabase.rpc("reserve_my_ai_usage", {
        target_analysis_kind: "application_pack", target_input_fingerprint: fingerprint, target_reserve_hkd_cents: reserveCents
      });
      if (reservation.error || !reservation.data) throw new Error(reservation.error?.message ?? "ai_reservation_failed");
      usageId = reservation.data;
      const output = await generateApplicationPack(createHash("sha256").update(user.id).digest("hex").slice(0, 64), payload);
      if (output.actualHkdCents > reserveCents) throw new Error("ai_cost_reservation_too_small");
      const completed = await supabase.rpc("complete_my_ai_analysis", {
        target_actual_hkd_cents: output.actualHkdCents,
        target_input_tokens: output.inputTokens,
        target_model: output.model,
        target_opportunity_id: opportunityId,
        target_output_tokens: output.outputTokens,
        target_prompt_version: applicationPackPromptVersion,
        target_result: output.result as Json,
        target_resume_version_id: versionId,
        target_usage_event_id: usageId
      });
      if (completed.error || !completed.data) throw new Error(completed.error?.message ?? "ai_complete_failed");
      usageId = null;
      const applied = await supabase.rpc("apply_my_application_pack", { target_analysis_id: completed.data });
      if (applied.error) throw new Error(applied.error.message);
    }
  } catch (error) {
    if (usageId) await supabase.rpc("fail_my_ai_usage", { target_usage_event_id: usageId, target_error_code: "application_pack_failed" });
    outcome = packNotice(error);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${outcome}`);
}

export async function saveApplicationDraft(formData: FormData) {
  const user = await requireUser();
  const returnTo = detailPath(formData);
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const fieldKey = String(formData.get("fieldKey") ?? "");
  const body = String(formData.get("body") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  const baseVersion = String(formData.get("baseVersion") ?? "");
  if (user.isMock || !opportunityId || !/^(cover_letter|tailoring_points|gap_explanation|qa_[1-5])$/.test(fieldKey) || body.length > 8000) {
    redirect(`${returnTo}?notice=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_my_application_draft", {
    target_opportunity_id: opportunityId,
    target_field_key: fieldKey,
    target_question: question || undefined,
    target_body: body,
    target_base_version: baseVersion ? Number(baseVersion) : undefined
  });
  if (error) {
    const message = error.message;
    redirect(`${returnTo}?notice=${message.includes("draft_version_conflict") ? "draft_conflict" : message.includes("privacy_locked") ? "privacy_locked" : "draft_save_failed"}`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=draft_saved`);
}

export async function unlockApplicationDraft(formData: FormData) {
  const user = await requireUser();
  const returnTo = detailPath(formData);
  const draftId = String(formData.get("draftId") ?? "");
  if (user.isMock || !draftId) redirect(`${returnTo}?notice=invalid`);
  const supabase = await createClient();
  const { error } = await supabase.rpc("unlock_my_application_draft", { target_draft_id: draftId });
  if (error) redirect(`${returnTo}?notice=${error.message.includes("privacy_locked") ? "privacy_locked" : "draft_save_failed"}`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=draft_unlocked`);
}
