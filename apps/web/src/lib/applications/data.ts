import "server-only";

import type { AppUser } from "@/lib/auth/types";
import { isResumeWorkspaceEnabled } from "@/lib/config";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type ApplicationPackage = Tables["application_packages"]["Row"];
export type ApplicationPackageItem = Tables["application_package_items"]["Row"];
export type ApplicationSnapshot = Tables["application_snapshots"]["Row"];
export type PackageResumeOption = { id: string; label: string; versionNumber: number; documentKind: string; archived: boolean; createdAt: string };

export type ApplicationPackageView = {
  package: ApplicationPackage | null;
  items: ApplicationPackageItem[];
  resumeOptions: PackageResumeOption[];
  assignedResumeVersionId: string | null;
  resumeWorkspaceEnabled: boolean;
};

export async function getResumeOptions(opportunityId: string) {
  const supabase = await createClient();
  const [documentsResult, versionsResult, assignmentResult] = await Promise.all([
    supabase.from("resume_documents").select("id,label,document_kind,archived_at"),
    supabase.from("resume_versions").select("id,document_id,version_number,created_at").order("created_at", { ascending: false }),
    supabase.from("opportunity_resume_assignments").select("resume_version_id")
      .eq("opportunity_id", opportunityId).eq("is_current", true).maybeSingle()
  ]);
  const firstError = [documentsResult, versionsResult, assignmentResult].map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  const documents = new Map((documentsResult.data ?? []).map((document) => [document.id, document]));
  const options: PackageResumeOption[] = (versionsResult.data ?? []).flatMap((version) => {
    const document = documents.get(version.document_id);
    return document ? [{
      id: version.id,
      label: document.label,
      versionNumber: version.version_number,
      documentKind: document.document_kind,
      archived: document.archived_at !== null,
      createdAt: version.created_at
    }] : [];
  });
  return { options, assignedResumeVersionId: assignmentResult.data?.resume_version_id ?? null };
}

export async function getApplicationPackage(user: AppUser, opportunityId: string): Promise<ApplicationPackageView> {
  const resumeWorkspaceEnabled = isResumeWorkspaceEnabled();
  if (user.isMock) {
    return { package: null, items: [], resumeOptions: [], assignedResumeVersionId: null, resumeWorkspaceEnabled };
  }
  const supabase = await createClient();
  const { data: packageRow, error } = await supabase.from("application_packages").select("*")
    .eq("opportunity_id", opportunityId).maybeSingle();
  if (error) throw error;
  const [itemsResult, resumes] = await Promise.all([
    packageRow
      ? supabase.from("application_package_items").select("*").eq("package_id", packageRow.id).order("position")
      : Promise.resolve({ data: [] as ApplicationPackageItem[], error: null }),
    resumeWorkspaceEnabled ? getResumeOptions(opportunityId) : Promise.resolve({ options: [], assignedResumeVersionId: null })
  ]);
  if (itemsResult.error) throw itemsResult.error;
  return {
    package: packageRow,
    items: itemsResult.data ?? [],
    resumeOptions: resumes.options,
    assignedResumeVersionId: resumes.assignedResumeVersionId,
    resumeWorkspaceEnabled
  };
}

export async function getApplicationSnapshots(user: AppUser, opportunityId: string): Promise<ApplicationSnapshot[]> {
  if (user.isMock) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("application_snapshots").select("*")
    .eq("opportunity_id", opportunityId).order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}
