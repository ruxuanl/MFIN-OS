import "server-only";

import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { QuestionFilters } from "./question";

export type OpportunitySkill = Database["public"]["Functions"]["get_my_opportunity_skills"]["Returns"][number];
export type SkillsView = {
  skills: OpportunitySkill[];
  resume: { id: string; label: string; versionNumber: number; hasSkills: boolean } | null;
};

export async function getOpportunitySkills(user: AppUser, opportunityId: string): Promise<SkillsView> {
  if (user.isMock) return { skills: [], resume: null };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_my_opportunity_skills", { target_opportunity_id: opportunityId });
  if (error) throw error;
  const skills = data ?? [];
  const resumeId = skills[0]?.resume_version_id ?? null;
  if (!resumeId) return { skills, resume: null };
  const [version, resumeSkills] = await Promise.all([
    supabase.from("resume_versions").select("id,version_number,document_id").eq("id", resumeId).maybeSingle(),
    supabase.from("resume_version_skills").select("id", { count: "exact", head: true }).eq("resume_version_id", resumeId)
  ]);
  if (version.error) throw version.error;
  if (!version.data) return { skills, resume: null };
  const document = await supabase.from("resume_documents").select("label").eq("id", version.data.document_id).maybeSingle();
  return {
    skills,
    resume: {
      id: version.data.id,
      label: document.data?.label ?? "简历",
      versionNumber: version.data.version_number,
      hasSkills: (resumeSkills.count ?? 0) > 0
    }
  };
}

export type MultiHopResult = Database["public"]["Functions"]["query_my_opportunities"]["Returns"][number];
export type MultiHopOutcome = { status: "ok"; results: MultiHopResult[] } | { status: "privacy_locked" } | { status: "mock" } | { status: "error" };

export async function queryOpportunities(user: AppUser, filters: QuestionFilters): Promise<MultiHopOutcome> {
  if (user.isMock) return { status: "mock" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("query_my_opportunities", {
    target_skills: filters.skills.length ? filters.skills : undefined,
    target_stages: filters.stages ?? undefined,
    target_track: filters.track ?? undefined,
    target_location: filters.location ?? undefined,
    target_replied: filters.replied ?? undefined,
    target_resume_gap: filters.resumeGap ?? undefined,
    target_deadline_within_days: filters.deadlineWithinDays ?? undefined,
    target_limit: 50
  });
  if (error) return { status: error.message.toLocaleLowerCase("en-US").includes("privacy_locked") ? "privacy_locked" : "error" };
  return { status: "ok", results: data ?? [] };
}
