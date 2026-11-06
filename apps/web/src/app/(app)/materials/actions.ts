"use server";

import { createHash, randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { analyzeJdMatch, analyzeResume, jdMatchPromptVersion, resumePromptVersion } from "@/lib/ai/openai-analysis";
import { requireUser } from "@/lib/auth/session";
import { getOpenAiConfig, isOpenAiConfigured, isResumeWorkspaceEnabled } from "@/lib/config";
import { extractResumeFile, ResumeFileValidationError } from "@/lib/resumes/file-intake";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function nullableRpc<T>(value: T | null) { return value as T; }

function safeFilename(value: string) {
  return value.replace(/[\u0000-\u001f\u007f]/gu, "").replace(/[\\/]/gu, "_").trim().slice(0, 255);
}

function analysisNotice(error: unknown) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase("en-US") : "";
  if (message.includes("ai_cached")) return "ai_cached";
  if (message.includes("budget")) return "ai_budget_exceeded";
  if (message.includes("permission") || message.includes("privacy")) return "ai_permission_required";
  return "ai_failed";
}

export async function uploadResume(formData: FormData) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) redirect("/materials?notice=workspace_unavailable");
  if (user.isMock) redirect("/materials?notice=preview");
  const file = formData.get("resumeFile");
  let label = String(formData.get("label") ?? "").trim();
  let documentKind = String(formData.get("documentKind") ?? "");
  const documentId = String(formData.get("documentId") ?? "").trim() || null;
  const sourceVersionId = String(formData.get("sourceVersionId") ?? "").trim() || null;
  if (!(file instanceof File) || !label || label.length > 160
    || !["master", "tailored"].includes(documentKind)) {
    redirect("/materials?notice=upload_invalid");
  }

  const supabase = await createClient();
  if (documentId) {
    const existingDocument = await supabase.from("resume_documents")
      .select("document_kind,label").eq("id", documentId).maybeSingle();
    if (existingDocument.error || !existingDocument.data) redirect("/materials?notice=upload_invalid");
    documentKind = existingDocument.data.document_kind;
    label = existingDocument.data.label;
  }
  const permission = await supabase.rpc("get_my_permission_decision", { capability_key: "files.upload" });
  if (permission.error || !permission.data?.[0]?.allowed) {
    redirect("/materials?notice=files_permission_required");
  }

  let extracted;
  try {
    extracted = await extractResumeFile(file);
  } catch (error) {
    const code = error instanceof ResumeFileValidationError ? error.code : "extract_failed";
    redirect(`/materials?notice=resume_${code}`);
  }
  const existing = await supabase.from("resume_versions").select("id").eq("content_sha256", extracted.contentSha256).maybeSingle();
  if (existing.error) redirect("/materials?notice=upload_failed");
  if (existing.data) redirect("/materials?notice=resume_duplicate");

  const versionId = randomUUID();
  const storagePath = `${user.id}/${versionId}/resume.${extracted.extension}`;
  const service = createServiceClient();
  const upload = await service.storage.from("resume-files").upload(storagePath, extracted.bytes, {
    contentType: extracted.mimeType,
    upsert: false
  });
  if (upload.error) redirect("/materials?notice=upload_failed");

  const originalFilename = safeFilename(file.name) || `resume.${extracted.extension}`;
  const registered = await supabase.rpc("register_my_resume_version", {
    target_content_sha256: extracted.contentSha256,
    target_document_id: nullableRpc(documentId),
    target_document_kind: documentKind,
    target_extracted_character_count: extracted.extractedCharacterCount,
    target_label: label,
    target_mime_type: extracted.mimeType,
    target_original_filename: originalFilename,
    target_page_count: nullableRpc(extracted.pageCount),
    target_size_bytes: extracted.sizeBytes,
    target_source_version_id: nullableRpc(sourceVersionId),
    target_storage_path: storagePath,
    target_version_id: versionId
  });
  if (registered.error) {
    await service.storage.from("resume-files").remove([storagePath]);
    const message = registered.error.message.toLocaleLowerCase("en-US");
    if (message.includes("permission") || message.includes("privacy")) {
      redirect("/materials?notice=files_permission_required");
    }
    if (message.includes("master_resume_already_exists")) redirect("/materials?notice=master_exists");
    redirect("/materials?notice=upload_failed");
  }
  revalidatePath("/materials");
  const registeredVersionId = registered.data?.[0]?.version_id ?? versionId;
  redirect(`/materials?notice=resume_uploaded&version=${encodeURIComponent(registeredVersionId)}`);
}

async function loadResume(versionId: string, userId: string) {
  const supabase = await createClient();
  const version = await supabase.from("resume_versions").select("*").eq("id", versionId).maybeSingle();
  if (version.error || !version.data) throw new Error("resume_version_not_found");
  const service = createServiceClient();
  const download = await service.storage.from("resume-files").download(version.data.storage_path);
  if (download.error || !download.data) throw new Error("resume_download_failed");
  const file = new File([await download.data.arrayBuffer()], version.data.original_filename, { type: version.data.mime_type });
  const extracted = await extractResumeFile(file);
  return {
    version: version.data,
    payload: {
      filename: version.data.original_filename,
      mimeType: version.data.mime_type,
      bytes: extracted.bytes,
      extractedText: extracted.extractedText
    },
    safetyIdentifier: createHash("sha256").update(userId).digest("hex").slice(0, 64)
  };
}

async function reserve(kind: "resume" | "jd_match", fingerprint: string) {
  const config = getOpenAiConfig();
  const supabase = await createClient();
  const result = await supabase.rpc("reserve_my_ai_usage", {
    target_analysis_kind: kind,
    target_input_fingerprint: fingerprint,
    target_reserve_hkd_cents: config.reserveHkdCents
  });
  if (result.error || !result.data) throw new Error(result.error?.message ?? "ai_reservation_failed");
  return { usageId: result.data, config, supabase };
}

export async function analyzeResumeVersion(formData: FormData) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) redirect("/materials?notice=workspace_unavailable");
  if (user.isMock) redirect("/materials?notice=preview");
  if (!isOpenAiConfigured()) redirect("/materials?notice=ai_not_configured");
  const versionId = String(formData.get("resumeVersionId") ?? "");
  if (!versionId) redirect("/materials?notice=upload_invalid");
  let usageId: string | null = null;
  try {
    const resume = await loadResume(versionId, user.id);
    const fingerprint = createHash("sha256")
      .update(`resume:${resume.version.content_sha256}:${resumePromptVersion}`).digest("hex");
    const supabase = await createClient();
    const cached = await supabase.from("ai_analyses").select("id")
      .eq("analysis_kind", "resume").eq("input_fingerprint", fingerprint)
      .eq("prompt_version", resumePromptVersion).maybeSingle();
    if (cached.data) throw new Error("ai_cached");
    const reservation = await reserve("resume", fingerprint);
    usageId = reservation.usageId;
    const output = await analyzeResume(resume.safetyIdentifier, resume.payload);
    if (output.actualHkdCents > reservation.config.reserveHkdCents) {
      throw new Error("ai_cost_reservation_too_small");
    }
    const completed = await reservation.supabase.rpc("complete_my_ai_analysis", {
      target_actual_hkd_cents: output.actualHkdCents,
      target_input_tokens: output.inputTokens,
      target_model: output.model,
      target_opportunity_id: nullableRpc<string>(null),
      target_output_tokens: output.outputTokens,
      target_prompt_version: resumePromptVersion,
      target_result: output.result as Json,
      target_resume_version_id: versionId,
      target_usage_event_id: usageId
    });
    if (completed.error) throw completed.error;
  } catch (error) {
    if (usageId && !(error instanceof Error && error.message === "ai_cost_reservation_too_small")) {
      const supabase = await createClient();
      await supabase.rpc("fail_my_ai_usage", { target_usage_event_id: usageId, target_error_code: "analysis_failed" });
    }
    redirect(`/materials?notice=${analysisNotice(error)}`);
  }
  revalidatePath("/materials");
  redirect("/materials?notice=ai_completed");
}

export async function assignOpportunityResume(formData: FormData) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) redirect("/materials?notice=workspace_unavailable");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const resumeVersionId = String(formData.get("resumeVersionId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/internships");
  if (user.isMock || !opportunityId || !resumeVersionId
    || returnTo !== `/internships/${opportunityId}`) {
    redirect("/internships?notice=invalid");
  }
  const supabase = await createClient();
  const result = await supabase.rpc("assign_my_opportunity_resume", {
    target_opportunity_id: opportunityId,
    target_resume_version_id: resumeVersionId
  });
  if (result.error) redirect(`${returnTo}?notice=resume_assign_failed`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=resume_assigned`);
}

export async function analyzeOpportunityJd(formData: FormData) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) redirect("/materials?notice=workspace_unavailable");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const returnTo = `/internships/${opportunityId}`;
  if (user.isMock || !opportunityId) redirect("/internships?notice=invalid");
  if (!isOpenAiConfigured()) redirect(`${returnTo}?notice=ai_not_configured`);
  let usageId: string | null = null;
  try {
    const supabase = await createClient();
    const [opportunity, assignment, documents, versions] = await Promise.all([
      supabase.from("opportunities").select("*").eq("id", opportunityId).eq("track", "internship").maybeSingle(),
      supabase.from("opportunity_resume_assignments").select("resume_version_id")
        .eq("opportunity_id", opportunityId).eq("is_current", true).maybeSingle(),
      supabase.from("resume_documents").select("id").eq("document_kind", "master").is("archived_at", null).maybeSingle(),
      supabase.from("resume_versions").select("id,document_id,content_sha256,created_at").order("created_at", { ascending: false })
    ]);
    if (opportunity.error || !opportunity.data?.raw_jd) throw new Error("opportunity_jd_not_found");
    let versionId = assignment.data?.resume_version_id ?? null;
    if (!versionId) {
      versionId = (versions.data ?? []).find((version) => version.document_id === documents.data?.id)?.id ?? null;
      if (!versionId) throw new Error("master_resume_required");
      const assigned = await supabase.rpc("assign_my_opportunity_resume", {
        target_opportunity_id: opportunityId,
        target_resume_version_id: versionId
      });
      if (assigned.error) throw assigned.error;
    }
    const resume = await loadResume(versionId, user.id);
    const fingerprint = createHash("sha256").update(
      `jd:${opportunity.data.raw_jd}:${resume.version.content_sha256}:${jdMatchPromptVersion}`
    ).digest("hex");
    const cached = await supabase.from("ai_analyses").select("id")
      .eq("analysis_kind", "jd_match").eq("input_fingerprint", fingerprint)
      .eq("prompt_version", jdMatchPromptVersion).maybeSingle();
    if (cached.data) throw new Error("ai_cached");
    const reservation = await reserve("jd_match", fingerprint);
    usageId = reservation.usageId;
    const context = [opportunity.data.company, opportunity.data.role_title,
      opportunity.data.department, opportunity.data.location,
      opportunity.data.posted_on ? `发布日 ${opportunity.data.posted_on}` : null,
      opportunity.data.deadline ? `截止日 ${opportunity.data.deadline}` : null]
      .filter(Boolean).join(" · ");
    const output = await analyzeJdMatch(resume.safetyIdentifier, resume.payload, opportunity.data.raw_jd, context);
    if (output.actualHkdCents > reservation.config.reserveHkdCents) {
      throw new Error("ai_cost_reservation_too_small");
    }
    const completed = await reservation.supabase.rpc("complete_my_ai_analysis", {
      target_actual_hkd_cents: output.actualHkdCents,
      target_input_tokens: output.inputTokens,
      target_model: output.model,
      target_opportunity_id: opportunityId,
      target_output_tokens: output.outputTokens,
      target_prompt_version: jdMatchPromptVersion,
      target_result: output.result as Json,
      target_resume_version_id: versionId,
      target_usage_event_id: usageId
    });
    if (completed.error) throw completed.error;
  } catch (error) {
    if (usageId && !(error instanceof Error && error.message === "ai_cost_reservation_too_small")) {
      const supabase = await createClient();
      await supabase.rpc("fail_my_ai_usage", { target_usage_event_id: usageId, target_error_code: "analysis_failed" });
    }
    const message = error instanceof Error ? error.message : "";
    const notice = message.includes("master_resume_required") ? "master_resume_required" : analysisNotice(error);
    redirect(`${returnTo}?notice=${notice}`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=ai_completed`);
}
