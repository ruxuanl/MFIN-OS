import type { AppUser } from "@/lib/auth/types";
import { isOpenAiConfigured, isResumeWorkspaceEnabled } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type ResumeDocument = Tables["resume_documents"]["Row"];
export type ResumeVersion = Tables["resume_versions"]["Row"];
export type AiAnalysis = Tables["ai_analyses"]["Row"];

export type ResumeDocumentWithVersions = ResumeDocument & {
  versions: ResumeVersion[];
};

export async function getResumeLibrary(user: AppUser) {
  if (user.isMock || !isResumeWorkspaceEnabled()) {
    return { documents: [], analyses: [], monthlyHkdCents: 0, aiConfigured: false };
  }
  const supabase = await createClient();
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [documentResult, versionResult, analysisResult, usageResult] = await Promise.all([
    supabase.from("resume_documents").select("*").is("archived_at", null).order("created_at"),
    supabase.from("resume_versions").select("*").order("version_number", { ascending: false }),
    supabase.from("ai_analyses").select("*").eq("analysis_kind", "resume").order("created_at", { ascending: false }),
    supabase.from("ai_usage_events").select("status,reserved_hkd_cents,actual_hkd_cents")
      .gte("created_at", monthStart.toISOString()).in("status", ["reserved", "completed"])
  ]);
  const firstError = [documentResult, versionResult, analysisResult, usageResult]
    .map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  const versions = versionResult.data ?? [];
  return {
    documents: (documentResult.data ?? []).map((document) => ({
      ...document,
      versions: versions.filter((version) => version.document_id === document.id)
    })),
    analyses: analysisResult.data ?? [],
    monthlyHkdCents: (usageResult.data ?? []).reduce((sum, event) =>
      sum + (event.status === "completed" ? event.actual_hkd_cents ?? 0 : event.reserved_hkd_cents), 0),
    aiConfigured: isOpenAiConfigured()
  };
}

export async function getOpportunityResumeContext(user: AppUser, opportunityId: string) {
  if (user.isMock) return { versions: [], currentAssignment: null, analyses: [] };
  const supabase = await createClient();
  const [documentsResult, versionsResult, assignmentResult, analysesResult] = await Promise.all([
    supabase.from("resume_documents").select("id,document_kind,label,archived_at"),
    supabase.from("resume_versions").select("*").order("created_at", { ascending: false }),
    supabase.from("opportunity_resume_assignments").select("*")
      .eq("opportunity_id", opportunityId).eq("is_current", true).maybeSingle(),
    supabase.from("ai_analyses").select("*").eq("analysis_kind", "jd_match")
      .eq("opportunity_id", opportunityId).order("created_at", { ascending: false })
  ]);
  const firstError = [documentsResult, versionsResult, assignmentResult, analysesResult]
    .map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  const documents = new Map((documentsResult.data ?? []).map((document) => [document.id, document]));
  return {
    versions: (versionsResult.data ?? [])
      .filter((version) => documents.get(version.document_id)?.archived_at === null
        || version.id === assignmentResult.data?.resume_version_id)
      .map((version) => ({
        ...version,
        document: documents.get(version.document_id) ?? null
      })),
    currentAssignment: assignmentResult.data,
    analyses: analysesResult.data ?? []
  };
}
