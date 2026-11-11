"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { parseBatchForm, summarize, type BatchItemResult, type BatchState } from "@/lib/candidates/batch";
import { maxInternshipJdLength, parseInternshipJd } from "@/lib/internships/jd-parser";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const tracks = new Set(["internship", "graduate"]);
const scopes = new Set(["internships", "graduate", "academics", "actions"]);
const fieldTypes = new Set(["text", "date", "option", "rating", "link"]);

function requiredText(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value || value.length > maxLength) throw new Error(`invalid_${key}`);
  return value;
}

function optionalText(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (!value) return null;
  if (value.length > maxLength) throw new Error(`invalid_${key}`);
  return value;
}

function trackPath(track: string) {
  return track === "internship" ? "/internships" : "/graduate";
}

function optionalDirectText(formData: FormData, key: string, maxLength: number) {
  const value = String(formData.get(key) ?? "").trim();
  if (value.length > maxLength) throw new Error(`invalid_${key}`);
  return value || null;
}

// Postgres function arguments are nullable even though generated RPC input
// types cannot currently express that distinction for required parameters.
function nullableRpc<T>(value: T | null) {
  return value as T;
}

export async function importOpportunityJd(formData: FormData) {
  const user = await requireUser();
  const track = String(formData.get("track") ?? "internship");
  if (!tracks.has(track)) redirect("/internships?notice=jd_import_failed");
  const base = trackPath(track);
  if (user.isMock) redirect(`${base}?notice=preview`);

  const rawJd = String(formData.get("rawJd") ?? "").trim();
  if (rawJd.length < 20 || rawJd.length > maxInternshipJdLength) {
    redirect(`${base}?notice=jd_import_failed`);
  }

  const extraction = parseInternshipJd(rawJd);
  let company: string;
  let roleTitle: string;
  let department: string | null;
  let location: string | null;
  let postedOn: string | null;
  let deadline: string | null;
  let sourceUrl: string | null;
  try {
    company = requiredText(formData, "company", 240);
    roleTitle = requiredText(formData, "roleTitle", 240);
    department = optionalDirectText(formData, "department", 240);
    location = optionalDirectText(formData, "location", 240);
    postedOn = optionalDirectText(formData, "postedOn", 20);
    deadline = optionalDirectText(formData, "deadline", 20);
    sourceUrl = optionalDirectText(formData, "sourceUrl", 2048);
  } catch {
    redirect(`${base}?notice=jd_import_incomplete`);
  }

  const stage = String(formData.get("stage") ?? "evaluation");
  const appliedAtDate = String(formData.get("appliedAt") ?? "").trim();
  if (!company || !roleTitle
    || !["evaluation", "preparation", "submitted"].includes(stage)
    || (postedOn && !/^\d{4}-\d{2}-\d{2}$/.test(postedOn))
    || (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline))
    || (appliedAtDate && !/^\d{4}-\d{2}-\d{2}$/.test(appliedAtDate))
    || (sourceUrl && !sourceUrl.startsWith("https://"))) {
    redirect(`${base}?notice=jd_import_failed`);
  }

  const fingerprint = createHash("sha256").update(rawJd, "utf8").digest("hex");
  const confirmedFields = new Set<string>([
    company ? "公司" : "",
    roleTitle ? "岗位" : "",
    department ? "部门" : "",
    location ? "地点" : "",
    postedOn ? "发布时间" : "",
    deadline ? "截止日期" : ""
  ].filter(Boolean));
  const remainingGaps = extraction.gaps.filter((gap) => !confirmedFields.has(gap));
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("import_my_jd", {
    target_application_method: nullableRpc(extraction.applicationMethod),
    target_applied_at: nullableRpc(stage === "submitted" ? (appliedAtDate ? `${appliedAtDate}T12:00:00+08:00` : null) : null),
    target_company: company,
    target_deadline: nullableRpc(deadline),
    target_department: nullableRpc(department),
    target_extraction_confidence: extraction.confidence,
    target_extraction_gaps: remainingGaps,
    target_jd_fingerprint: fingerprint,
    target_location: nullableRpc(location),
    target_parser_version: extraction.parserVersion,
    target_posted_on: nullableRpc(postedOn),
    target_raw_jd: rawJd,
    target_requirements: nullableRpc(extraction.requirements),
    target_responsibilities: nullableRpc(extraction.responsibilities),
    target_role_title: roleTitle,
    target_source_url: nullableRpc(sourceUrl),
    target_stage: stage,
    target_track: track
  });
  if (error || !data?.[0]?.opportunity_id) {
    const message = error?.message.toLocaleLowerCase("en-US") ?? "";
    if (message.includes("privacy_locked") || message.includes("row-level security")) {
      redirect(`${base}?notice=privacy_locked`);
    }
    redirect(`${base}?notice=jd_import_failed`);
  }

  const result = data[0];
  // A duplicate JD may already live under the other track; open it where it is.
  const resultBase = trackPath(result.opportunity_track);
  revalidatePath(resultBase);
  revalidatePath(`${resultBase}/${result.opportunity_id}`);
  redirect(`${resultBase}/${result.opportunity_id}?notice=${result.created ? "jd_imported" : "jd_duplicate"}`);
}

export async function createCandidate(formData: FormData) {
  const user = await requireUser();
  const track = String(formData.get("track") ?? "");
  if (user.isMock || !tracks.has(track)) redirect("/internships?notice=preview");

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("opportunity_candidates").insert({
      user_id: user.id,
      track,
      company: requiredText(formData, "company", 240),
      role_title: requiredText(formData, "roleTitle", 240),
      department: optionalText(formData, "department", 240),
      location: optionalText(formData, "location", 240),
      work_mode: optionalText(formData, "workMode", 40),
      deadline: optionalText(formData, "deadline", 20),
      source_summary: optionalText(formData, "sourceSummary", 1000),
      source_url: optionalText(formData, "sourceUrl", 2048)
    });
    if (error) throw error;
  } catch {
    redirect(`${trackPath(track)}?notice=create_failed`);
  }
  revalidatePath(trackPath(track));
  redirect(`${trackPath(track)}?notice=candidate_created`);
}

export async function promoteCandidate(formData: FormData) {
  const user = await requireUser();
  const track = String(formData.get("track") ?? "");
  const intent = String(formData.get("intent") ?? "");
  const candidateId = String(formData.get("candidateId") ?? "");
  if (user.isMock || !tracks.has(track) || !["track", "apply"].includes(intent) || !candidateId) {
    redirect(`${trackPath(track)}?notice=invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_opportunity_candidate", {
    target_candidate_id: candidateId,
    target_intent: intent
  });
  if (error || !data) redirect(`${trackPath(track)}?notice=promote_failed`);
  const base = trackPath(track);
  revalidatePath(base);
  redirect(`${base}/${data}?notice=promoted`);
}

export async function createCourse(formData: FormData) {
  const user = await requireUser();
  if (user.isMock) redirect("/academics?notice=preview");
  let courseId: string;
  try {
    const moduleText = optionalText(formData, "module", 2);
    const supabase = await createClient();
    const { data, error } = await supabase.from("courses").insert({
      user_id: user.id,
      module: moduleText ? Number(moduleText) : null,
      course_code: requiredText(formData, "courseCode", 40),
      title: requiredText(formData, "title", 240),
      starts_on: optionalText(formData, "startsOn", 20),
      ends_on: optionalText(formData, "endsOn", 20),
      fixed_schedule: optionalText(formData, "fixedSchedule", 1000)
    }).select("id").single();
    if (error) throw error;
    courseId = data.id;
  } catch {
    redirect("/academics?notice=create_failed");
  }
  revalidatePath("/academics");
  redirect(`/academics/${courseId}?notice=created`);
}

export async function createAction(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  if (user.isMock) redirect(`${returnTo}?notice=preview`);

  const contextType = String(formData.get("contextType") ?? "");
  const contextId = optionalText(formData, "contextId", 40);
  const track = String(formData.get("track") ?? "");
  if (!["opportunity", "course", "personal"].includes(contextType)) redirect(`${returnTo}?notice=invalid`);

  try {
    const estimateText = optionalText(formData, "estimatedMinutes", 8);
    const supabase = await createClient();
    const { error } = await supabase.from("actions").insert({
      user_id: user.id,
      context_type: contextType,
      context_id: contextId,
      track,
      title: requiredText(formData, "title", 300),
      due_at: optionalText(formData, "dueAt", 40),
      suggested_start_at: optionalText(formData, "suggestedStartAt", 40),
      estimated_minutes: estimateText ? Number(estimateText) : null,
      priority: String(formData.get("priority") ?? "normal"),
      completion_criteria: optionalText(formData, "completionCriteria", 1000)
    });
    if (error) throw error;
  } catch {
    redirect(`${returnTo}?notice=action_failed`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=action_created`);
}

export async function addActionDependency(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  const actionId = String(formData.get("actionId") ?? "");
  const dependsOnActionId = String(formData.get("dependsOnActionId") ?? "");
  if (user.isMock || !actionId || !dependsOnActionId || actionId === dependsOnActionId) {
    redirect(`${returnTo}?notice=invalid`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("action_dependencies").insert({
    user_id: user.id,
    action_id: actionId,
    depends_on_action_id: dependsOnActionId
  });
  if (error) redirect(`${returnTo}?notice=dependency_failed`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=dependency_saved`);
}

export async function saveWorkspaceView(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  const scope = String(formData.get("scope") ?? "");
  if (user.isMock || !scopes.has(scope)) redirect(`${returnTo}?notice=invalid`);
  try {
    const filters = JSON.parse(String(formData.get("filters") ?? "{}")) as Json;
    const sortSpec = JSON.parse(String(formData.get("sortSpec") ?? "[]")) as Json;
    const supabase = await createClient();
    const { error } = await supabase.from("saved_views").insert({
      user_id: user.id,
      scope,
      name: requiredText(formData, "name", 120),
      filters,
      sort_spec: sortSpec
    });
    if (error) throw error;
  } catch {
    redirect(`${returnTo}?notice=view_failed`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=view_saved`);
}

export async function createCustomField(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  const scope = String(formData.get("scope") ?? "");
  const fieldType = String(formData.get("fieldType") ?? "");
  if (user.isMock || !["internship", "graduate", "academic"].includes(scope) || !fieldTypes.has(fieldType)) {
    redirect(`${returnTo}?notice=invalid`);
  }
  try {
    const label = requiredText(formData, "label", 120);
    const fieldKey = `${label.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "field"}_${Date.now().toString(36)}`;
    const optionsText = optionalText(formData, "options", 1000);
    const options = optionsText ? optionsText.split(",").map((item) => item.trim()).filter(Boolean) : [];
    const supabase = await createClient();
    const { error } = await supabase.from("custom_field_definitions").insert({
      user_id: user.id,
      scope,
      field_key: fieldKey,
      label,
      field_type: fieldType,
      options
    });
    if (error) throw error;
  } catch {
    redirect(`${returnTo}?notice=field_failed`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=field_created`);
}

export async function setCustomFieldValue(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  const definitionId = String(formData.get("definitionId") ?? "");
  const entityType = String(formData.get("entityType") ?? "");
  const entityId = String(formData.get("entityId") ?? "");
  if (user.isMock || !["opportunity", "course"].includes(entityType) || !definitionId || !entityId) {
    redirect(`${returnTo}?notice=invalid`);
  }
  try {
    const value = String(formData.get("value") ?? "").trim();
    const supabase = await createClient();
    const { error } = await supabase.from("custom_field_values").upsert({
      user_id: user.id,
      definition_id: definitionId,
      entity_type: entityType,
      entity_id: entityId,
      value,
      version: 1
    }, { onConflict: "definition_id,entity_type,entity_id" });
    if (error) throw error;
    await supabase.from("field_locks").upsert({
      user_id: user.id,
      object_type: entityType,
      object_id: entityId,
      field_path: `custom:${definitionId}`,
      reason: "user_manual_edit"
    }, { onConflict: "user_id,object_type,object_id,field_path,unlocked_at" });
  } catch {
    redirect(`${returnTo}?notice=value_failed`);
  }
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=value_saved`);
}

export async function resolveConflict(formData: FormData) {
  const user = await requireUser();
  const returnTo = String(formData.get("returnTo") ?? "/");
  if (user.isMock) redirect(`${returnTo}?notice=preview`);
  const resolution = String(formData.get("resolution") ?? "");
  const conflictId = String(formData.get("conflictId") ?? "");
  const manualValue = optionalText(formData, "manualValue", 2000);
  const supabase = await createClient();
  const { error } = await supabase.rpc("resolve_sync_conflict", {
    target_conflict_id: conflictId,
    target_resolution: resolution,
    target_manual_value: manualValue
  });
  if (error) redirect(`${returnTo}?notice=conflict_changed`);
  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=conflict_resolved`);
}

export async function batchDecideCandidates(_previous: BatchState, formData: FormData): Promise<BatchState> {
  const user = await requireUser();
  const track = String(formData.get("track") ?? "");
  if (!tracks.has(track)) return { status: "error", message: "无效的求职线。", results: [] };
  if (user.isMock) return { status: "error", message: "隔离预览模式不会写入数据。", results: [] };
  const parsed = parseBatchForm({ ids: formData.getAll("candidateIds"), decision: formData.get("decision"), reason: formData.get("reason") });
  if (!parsed.ok) return { status: "error", message: parsed.message, results: [] };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_my_candidates", {
    target_candidate_ids: parsed.ids,
    target_decision: parsed.decision,
    target_reason: parsed.reason ?? undefined
  });
  if (error) {
    const locked = error.message.toLocaleLowerCase("en-US").includes("privacy_locked");
    return { status: "error", message: locked ? "隐私锁已开启，当前不能写入。" : "批量处理失败，所有候选保持原状。", results: [] };
  }
  const results: BatchItemResult[] = (data ?? []).map((row) => ({
    candidateId: row.candidate_id,
    outcome: row.outcome as BatchItemResult["outcome"],
    errorCode: row.error_code
  }));
  revalidatePath(trackPath(track));
  return { status: "done", message: summarize(results), results };
}
