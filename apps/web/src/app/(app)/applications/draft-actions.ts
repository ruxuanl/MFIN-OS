"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { applicationPackPromptVersion, buildPackPayload, fingerprintSource, packReserveHkdCents, parseQuestions } from "@/lib/ai/application-pack";
import { generateApplicationPack, generateCoverLetter } from "@/lib/ai/openai-analysis";
import {coverLetterPayload,coverLetterPromptVersion,validateCoverLetter} from "@/lib/ai/cover-letter";
import { requireUser } from "@/lib/auth/session";
import { getAiCacheScope, getOpenAiConfig, isOpenAiConfigured } from "@/lib/config";
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
  if(message.includes("draft_locked"))return "draft_locked";
  if(message.includes("draft_version_conflict"))return "draft_conflict";
  if(message.includes("cover_letter_base_required"))return "draft_base_required";
  if (message.includes("draft_resume_unconfirmed")) return "draft_resume_unconfirmed";
  if (message.includes("ai_usage_unsettled")) return "ai_usage_unsettled";
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
    const fingerprint = createHash("sha256").update(`${getAiCacheScope()}:${fingerprintSource(payload)}`).digest("hex");

    const cached = await supabase.from("ai_analyses").select("id").eq("analysis_kind", "application_pack")
      .eq("input_fingerprint", fingerprint).eq("prompt_version", applicationPackPromptVersion).maybeSingle();
    if (cached.data) {
      const applied = await supabase.rpc("apply_my_application_pack", { target_analysis_id: cached.data.id });
      if (applied.error) throw new Error(applied.error.message);
      outcome = "drafts_cached";
    } else {
      const config = getOpenAiConfig();
      const reserveCents = packReserveHkdCents(payload, config);
      const reservation = await supabase.rpc("reserve_my_ai_usage_for_provider", {
        target_analysis_kind: "application_pack", target_input_fingerprint: fingerprint, target_reserve_hkd_cents: reserveCents,
        target_provider: config.provider
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
    if (usageId && !(error instanceof Error && ["ai_cost_reservation_too_small", "ai_usage_unsettled"].includes(error.message))) {
      await supabase.rpc("fail_my_ai_usage", { target_usage_event_id: usageId, target_error_code: "application_pack_failed" });
    }
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
  const body = String(formData.get("body") ?? "").replace(/\r\n?/g,"\n");
  const question = String(formData.get("question") ?? "").trim();
  const baseVersion = String(formData.get("baseVersion") ?? "");
  if (user.isMock || !opportunityId || !/^(cover_letter_base|cover_letter|tailoring_points|gap_explanation|qa_[1-5])$/.test(fieldKey) || body.length > 8000) {
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

export async function generateCoverLetterAction(formData:FormData){
 const user=await requireUser(),returnTo=detailPath(formData);
 const opportunityId=String(formData.get("opportunityId")??""),versionId=String(formData.get("resumeVersionId")??""),base=String(formData.get("defaultLetter")??"").replace(/\r\n?/g,"\n");
 if(user.isMock || !/^\/internships\/[0-9a-f-]{36}$/i.test(returnTo) || !opportunityId || !versionId || !base.trim() || base.length>8000)redirect(`${returnTo}?notice=draft_base_required`);
 const client=await createClient();let usageId:string|null=null,outcome="drafts_generated",called=false;
 const check=async()=>{const r=await client.rpc("get_my_permission_decision",{capability_key:"ai.material_draft"});if(r.error || !r.data?.[0]?.allowed)throw new Error("ai_permission_denied");};
 try {
  await check();const config=getOpenAiConfig();if(config.provider!=="deepseek")throw new Error("ai_permission_deepseek_required");
  const [job,resume,letter]=await Promise.all([
   client.from("opportunities").select("company,role_title,raw_jd,responsibilities,requirements").eq("id",opportunityId).eq("user_id",user.id).eq("track","internship").maybeSingle(),
   client.from("resume_versions").select("id").eq("id",versionId).eq("user_id",user.id).maybeSingle(),
   client.from("application_drafts").select("locked").eq("opportunity_id",opportunityId).eq("field_key","cover_letter").maybeSingle()
  ]);
  if(job.error || !job.data || resume.error || !resume.data || letter.error)throw new Error("resume_or_job_unavailable");
  if(letter.data?.locked)throw new Error("draft_locked");
  const save=await client.rpc("save_my_application_draft",{target_opportunity_id:opportunityId,target_field_key:"cover_letter_base",target_body:base,target_base_version:formData.get("baseVersion")?Number(formData.get("baseVersion")):undefined});
  if(save.error)throw new Error(save.error.message);
  const payload=coverLetterPayload({company:job.data.company,roleTitle:job.data.role_title,jdText:job.data.raw_jd || [job.data.responsibilities,job.data.requirements].filter(Boolean).join("\n\n"),resumeVersionId:versionId,resumeText:await loadResumeText(versionId),questions:[]},base);
  const fingerprint=createHash("sha256").update(JSON.stringify({scope:getAiCacheScope(),payload})).digest("hex");
  const cached=await client.from("ai_analyses").select("id,result").eq("analysis_kind","application_pack").eq("input_fingerprint",fingerprint).eq("prompt_version",coverLetterPromptVersion).maybeSingle();if(cached.error)throw new Error("cache_unavailable");
  let result:unknown=cached.data?.result;
  let analysisId=cached.data?.id;
  if(!analysisId){
   const reserve=Math.max(config.reserveHkdCents,Math.ceil(((JSON.stringify(payload).length*4+5000)*config.inputUsdPerMillion+3000*config.outputUsdPerMillion)/1e6*config.usdHkdRate*100));
   const r=await client.rpc("reserve_my_ai_usage_for_provider",{target_analysis_kind:"application_pack",target_input_fingerprint:fingerprint,target_reserve_hkd_cents:reserve,target_provider:"deepseek"});if(r.error || !r.data)throw new Error(r.error?.message??"reservation_failed");usageId=r.data;
   await check();called=true;
   const output=await generateCoverLetter(createHash("sha256").update(user.id).digest("hex"),payload);
   result=output.result;
   if(output.actualHkdCents>reserve)throw new Error("ai_usage_unsettled");
   const complete=await client.rpc("complete_my_ai_analysis",{target_usage_event_id:usageId,target_opportunity_id:opportunityId,target_resume_version_id:versionId,target_model:output.model,target_prompt_version:coverLetterPromptVersion,target_result:output.result as Json,target_input_tokens:output.inputTokens,target_output_tokens:output.outputTokens,target_actual_hkd_cents:output.actualHkdCents});
   if(complete.error || !complete.data)throw new Error("ai_usage_unsettled");usageId=null;analysisId=complete.data;
  }else outcome="drafts_cached";
  validateCoverLetter(result,payload);
  await check();const applied=await client.rpc("apply_my_application_pack",{target_analysis_id:analysisId});if(applied.error)throw new Error(applied.error.message);if(!applied.data)throw new Error("draft_locked");
 }catch(error){
  // A possibly billed request keeps its reservation until usage is known.
  if(usageId && (!called || error instanceof Error && error.message==="ai_provider_rejected"))await client.rpc("fail_my_ai_usage",{target_usage_event_id:usageId,target_error_code:"cover_letter_failed"});
  outcome=called && usageId?"ai_usage_unsettled":packNotice(error);
 }
 revalidatePath(returnTo);redirect(`${returnTo}?notice=${outcome}`);
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
