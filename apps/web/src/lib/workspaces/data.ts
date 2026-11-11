import { isResumeWorkspaceEnabled } from "@/lib/config";
import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { toIlikePattern } from "@/lib/workspaces/list-query";

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
  page?: number;
};

export const opportunityPageSize = 50;

// List views only need these columns; raw JD, responsibilities and requirements
// (up to tens of KB per row) are loaded on the detail page only.
const opportunityListColumns =
  "id,track,company,role_title,department,location,main_stage,substage,deadline,applied_at,record_state,updated_at";
const candidateListColumns =
  "id,track,company,role_title,department,location,deadline,source_summary,source_url,decision_status,updated_at";
const stageValues = new Set(["new", "evaluation", "preparation", "submitted", "test", "interview", "waiting", "offer", "ended"]);


export async function getOpportunityWorkspace(
  user: AppUser,
  track: "internship" | "graduate",
  filters: OpportunityFilters = {}
) {
  if (user.isMock) {
    return {
      candidates: [], opportunities: [], totalOpportunities: 0, page: 1, pageSize: opportunityPageSize,
      actions: [], views: [], pendingConflicts: 0, resumeByOpportunity: {}
    };
  }

  const supabase = await createClient();
  const scope = track === "internship" ? "internships" : "graduate";
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const from = (page - 1) * opportunityPageSize;

  let opportunityQuery = supabase
    .from("opportunities")
    .select(opportunityListColumns, { count: "exact" })
    .eq("track", track)
    .eq("record_state", filters.state ?? "active");
  if (filters.stage && stageValues.has(filters.stage)) opportunityQuery = opportunityQuery.eq("main_stage", filters.stage);
  const pattern = toIlikePattern(filters.query);
  if (pattern) {
    opportunityQuery = opportunityQuery.or(
      ["company", "role_title", "location", "department"].map((column) => `${column}.ilike.${pattern}`).join(",")
    );
  }
  opportunityQuery = filters.sort === "deadline"
    ? opportunityQuery.order("deadline", { ascending: true, nullsFirst: false }).order("updated_at", { ascending: false })
    : filters.sort === "company"
      ? opportunityQuery.order("company", { ascending: true }).order("updated_at", { ascending: false })
      : opportunityQuery.order("updated_at", { ascending: false });

  const [candidateResult, opportunityResult, actionResult, viewResult, conflictResult,
    assignmentResult, resumeVersionResult, resumeDocumentResult] = await Promise.all([
    supabase
      .from("opportunity_candidates")
      .select(candidateListColumns)
      .eq("track", track)
      .in("decision_status", ["candidate", "later"])
      .order("updated_at", { ascending: false }),
    opportunityQuery.range(from, from + opportunityPageSize - 1),
    supabase
      .from("actions")
      .select("id,context_id,title,due_at,status")
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

  const opportunities = opportunityResult.data ?? [];
  const totalOpportunities = opportunityResult.count ?? opportunities.length;

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
    totalOpportunities,
    page,
    pageSize: opportunityPageSize,
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
