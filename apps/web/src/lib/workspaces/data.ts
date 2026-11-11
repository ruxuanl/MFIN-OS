import { isResumeWorkspaceEnabled } from "@/lib/config";
import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type Candidate = Tables["opportunity_candidates"]["Row"];
export type Opportunity = Tables["opportunities"]["Row"];
export type Course = Tables["courses"]["Row"];
export type Action = Tables["actions"]["Row"];
export type ActionDependency = Tables["action_dependencies"]["Row"];
export type TimelineEntry = Tables["timeline_entries"]["Row"];
export type FieldLock = Tables["field_locks"]["Row"];
export type SyncConflict = Tables["sync_conflicts"]["Row"];
export type SavedView = Tables["saved_views"]["Row"];
export type CustomFieldDefinition = Tables["custom_field_definitions"]["Row"];
export type CustomFieldValue = Tables["custom_field_values"]["Row"];

export type OpportunityFilters = {
  query?: string;
  stage?: string;
  state?: "active" | "archived";
  sort?: "updated" | "deadline" | "company";
};

function compareNullable(left: string | null, right: string | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left.localeCompare(right, "zh-CN");
}

export async function getOpportunityWorkspace(
  user: AppUser,
  track: "internship" | "graduate",
  filters: OpportunityFilters = {}
) {
  if (user.isMock) {
    return { candidates: [], opportunities: [], actions: [], views: [], pendingConflicts: 0, resumeByOpportunity: {} };
  }

  const supabase = await createClient();
  const scope = track === "internship" ? "internships" : "graduate";
  const [candidateResult, opportunityResult, actionResult, viewResult, conflictResult,
    assignmentResult, resumeVersionResult, resumeDocumentResult] = await Promise.all([
    supabase
      .from("opportunity_candidates")
      .select("*")
      .eq("track", track)
      .in("decision_status", ["candidate", "later"])
      .order("updated_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select("*")
      .eq("track", track)
      .order("updated_at", { ascending: false }),
    supabase
      .from("actions")
      .select("*")
      .eq("track", track)
      .neq("status", "cancelled")
      .order("due_at", { ascending: true, nullsFirst: false }),
    supabase.from("saved_views").select("*").eq("scope", scope).order("name"),
    supabase.from("sync_conflicts").select("id", { count: "exact", head: true }).eq("status", "pending"),
    isResumeWorkspaceEnabled() ? supabase.from("opportunity_resume_assignments").select("opportunity_id,resume_version_id").eq("is_current", true) : Promise.resolve({ data: [] as Database["public"]["Tables"]["opportunity_resume_assignments"]["Row"][], error: null }),
    isResumeWorkspaceEnabled() ? supabase.from("resume_versions").select("id,document_id,version_number") : Promise.resolve({ data: [] as Database["public"]["Tables"]["resume_versions"]["Row"][], error: null }),
    isResumeWorkspaceEnabled() ? supabase.from("resume_documents").select("id,label,document_kind,archived_at") : Promise.resolve({ data: [] as Database["public"]["Tables"]["resume_documents"]["Row"][], error: null })
  ]);

  const firstError = [candidateResult, opportunityResult, actionResult, viewResult, conflictResult,
    assignmentResult, resumeVersionResult, resumeDocumentResult]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw firstError;

  let opportunities = opportunityResult.data ?? [];
  const query = filters.query?.trim().toLocaleLowerCase("zh-CN");
  if (query) {
    opportunities = opportunities.filter((item) =>
      [item.company, item.role_title, item.location, item.department]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase("zh-CN").includes(query))
    );
  }
  if (filters.stage) opportunities = opportunities.filter((item) => item.main_stage === filters.stage);
  opportunities = opportunities.filter((item) => item.record_state === (filters.state ?? "active"));

  opportunities.sort((left, right) => {
    if (filters.sort === "deadline") return compareNullable(left.deadline, right.deadline);
    if (filters.sort === "company") return left.company.localeCompare(right.company, "zh-CN");
    return right.updated_at.localeCompare(left.updated_at);
  });

  const resumeVersions = new Map((resumeVersionResult.data ?? []).map((version) => [version.id, version]));
  const resumeDocuments = new Map((resumeDocumentResult.data ?? []).map((document) => [document.id, document]));
  const resumeByOpportunity: Record<string, { id: string; label: string; versionNumber: number }> = Object.fromEntries((assignmentResult.data ?? []).flatMap((assignment) => {
    const version = resumeVersions.get(assignment.resume_version_id);
    const document = version ? resumeDocuments.get(version.document_id) : null;
    return version ? [[assignment.opportunity_id, {
      id: version.id,
      label: document?.label ?? "简历",
      versionNumber: version.version_number
    }]] : [];
  }));
  const masterDocument = (resumeDocumentResult.data ?? []).find((document) =>
    document.document_kind === "master" && document.archived_at === null
  );
  const defaultMasterVersion = masterDocument
    ? (resumeVersionResult.data ?? [])
      .filter((version) => version.document_id === masterDocument.id)
      .sort((left, right) => right.version_number - left.version_number)[0]
    : null;
  if (masterDocument && defaultMasterVersion) {
    for (const opportunity of opportunities) {
      resumeByOpportunity[opportunity.id] ??= {
        id: defaultMasterVersion.id,
        label: masterDocument.label,
        versionNumber: defaultMasterVersion.version_number
      };
    }
  }

  return {
    candidates: candidateResult.data ?? [],
    opportunities,
    actions: actionResult.data ?? [],
    views: viewResult.data ?? [],
    pendingConflicts: conflictResult.count ?? 0,
    resumeByOpportunity
  };
}

export async function getOpportunityDetail(
  user: AppUser,
  id: string,
  expectedTrack: "internship" | "graduate"
) {
  if (user.isMock) return null;
  const supabase = await createClient();
  const [opportunityResult, actionResult, dependencyResult, timelineResult, lockResult, conflictResult, definitionResult, valueResult] =
    await Promise.all([
      supabase.from("opportunities").select("*").eq("id", id).eq("track", expectedTrack).maybeSingle(),
      supabase.from("actions").select("*").eq("context_type", "opportunity").eq("context_id", id).order("due_at"),
      supabase.from("action_dependencies").select("*"),
      supabase.from("timeline_entries").select("*").eq("entity_type", "opportunity").eq("entity_id", id).order("occurred_at", { ascending: false }),
      supabase.from("field_locks").select("*").eq("object_type", "opportunity").eq("object_id", id).is("unlocked_at", null),
      supabase.from("sync_conflicts").select("*").eq("object_type", "opportunity").eq("object_id", id).eq("status", "pending").order("created_at"),
      supabase.from("custom_field_definitions").select("*").eq("scope", expectedTrack).eq("active", true).order("position"),
      supabase.from("custom_field_values").select("*").eq("entity_type", "opportunity").eq("entity_id", id)
    ]);
  const results = [opportunityResult, actionResult, dependencyResult, timelineResult, lockResult, conflictResult, definitionResult, valueResult];
  const firstError = results.map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  if (!opportunityResult.data) return null;
  return {
    opportunity: opportunityResult.data,
    actions: actionResult.data ?? [],
    dependencies: dependencyResult.data ?? [],
    timeline: timelineResult.data ?? [],
    locks: lockResult.data ?? [],
    conflicts: conflictResult.data ?? [],
    customFields: definitionResult.data ?? [],
    customValues: valueResult.data ?? []
  };
}

export async function getAcademicWorkspace(user: AppUser, state: "active" | "archived" = "active") {
  if (user.isMock) return { courses: [], actions: [], views: [], pendingConflicts: 0 };
  const supabase = await createClient();
  const [courseResult, actionResult, viewResult, conflictResult] = await Promise.all([
    supabase.from("courses").select("*").eq("record_state", state).order("module").order("course_code"),
    supabase.from("actions").select("*").eq("track", "academic").neq("status", "cancelled").order("due_at"),
    supabase.from("saved_views").select("*").eq("scope", "academics").order("name"),
    supabase.from("sync_conflicts").select("id", { count: "exact", head: true }).eq("status", "pending")
  ]);
  const firstError = [courseResult, actionResult, viewResult, conflictResult].map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  return {
    courses: courseResult.data ?? [],
    actions: actionResult.data ?? [],
    views: viewResult.data ?? [],
    pendingConflicts: conflictResult.count ?? 0
  };
}

export async function getCourseDetail(user: AppUser, id: string) {
  if (user.isMock) return null;
  const supabase = await createClient();
  const [courseResult, actionResult, dependencyResult, timelineResult, lockResult, conflictResult, definitionResult, valueResult] =
    await Promise.all([
      supabase.from("courses").select("*").eq("id", id).maybeSingle(),
      supabase.from("actions").select("*").eq("context_type", "course").eq("context_id", id).order("due_at"),
      supabase.from("action_dependencies").select("*"),
      supabase.from("timeline_entries").select("*").eq("entity_type", "course").eq("entity_id", id).order("occurred_at", { ascending: false }),
      supabase.from("field_locks").select("*").eq("object_type", "course").eq("object_id", id).is("unlocked_at", null),
      supabase.from("sync_conflicts").select("*").eq("object_type", "course").eq("object_id", id).eq("status", "pending").order("created_at"),
      supabase.from("custom_field_definitions").select("*").eq("scope", "academic").eq("active", true).order("position"),
      supabase.from("custom_field_values").select("*").eq("entity_type", "course").eq("entity_id", id)
    ]);
  const results = [courseResult, actionResult, dependencyResult, timelineResult, lockResult, conflictResult, definitionResult, valueResult];
  const firstError = results.map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  if (!courseResult.data) return null;
  return {
    course: courseResult.data,
    actions: actionResult.data ?? [],
    dependencies: dependencyResult.data ?? [],
    timeline: timelineResult.data ?? [],
    locks: lockResult.data ?? [],
    conflicts: conflictResult.data ?? [],
    customFields: definitionResult.data ?? [],
    customValues: valueResult.data ?? []
  };
}

export async function getTodayWorkspace(user: AppUser) {
  if (user.isMock) return { actions: [], internshipCount: 0, graduateCount: 0, courseCount: 0 };
  const supabase = await createClient();
  const [actionResult, internshipResult, graduateResult, courseResult] = await Promise.all([
    supabase.from("actions").select("*").in("status", ["unscheduled", "scheduled", "waiting"]).order("due_at", { ascending: true, nullsFirst: false }).limit(3),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("track", "internship").eq("record_state", "active"),
    supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("track", "graduate").eq("record_state", "active"),
    supabase.from("courses").select("id", { count: "exact", head: true }).eq("record_state", "active")
  ]);
  const firstError = [actionResult, internshipResult, graduateResult, courseResult].map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  return {
    actions: actionResult.data ?? [],
    internshipCount: internshipResult.count ?? 0,
    graduateCount: graduateResult.count ?? 0,
    courseCount: courseResult.count ?? 0
  };
}
