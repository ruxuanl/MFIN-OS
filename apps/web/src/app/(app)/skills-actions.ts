"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { extractResumeFile } from "@/lib/resumes/file-intake";
import { skillLabelByKey } from "@/lib/skills/dictionary";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

function safeReturn(value: FormDataEntryValue | null) {
  const path = String(value ?? "/");
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

function withNotice(path: string, notice: string) {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${notice}`;
}

export async function setOpportunitySkillAction(formData: FormData) {
  const user = await requireUser();
  const returnTo = safeReturn(formData.get("returnTo"));
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const skillKey = String(formData.get("skillKey") ?? "");
  const present = String(formData.get("present") ?? "");
  if (user.isMock || !opportunityId || !skillLabelByKey.has(skillKey) || !["true", "false"].includes(present)) {
    redirect(withNotice(returnTo, "invalid"));
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_opportunity_skill", {
    target_opportunity_id: opportunityId, target_skill_key: skillKey, target_present: present === "true"
  });
  if (error) redirect(withNotice(returnTo, error.message.includes("privacy_locked") ? "privacy_locked" : "skill_failed"));
  revalidatePath(returnTo);
  redirect(withNotice(returnTo, "skill_saved"));
}

// For resume versions uploaded before #16: read the stored file once and keep its text (D30).
export async function extractResumeSkillsAction(formData: FormData) {
  const user = await requireUser();
  const returnTo = safeReturn(formData.get("returnTo"));
  const versionId = String(formData.get("versionId") ?? "");
  if (user.isMock || !versionId) redirect(withNotice(returnTo, "invalid"));
  const supabase = await createClient();
  const version = await supabase.from("resume_versions").select("id,storage_path,original_filename,mime_type").eq("id", versionId).maybeSingle();
  if (version.error || !version.data) redirect(withNotice(returnTo, "resume_skills_failed"));
  let text = "";
  try {
    const download = await createServiceClient().storage.from("resume-files").download(version.data.storage_path);
    if (download.error || !download.data) throw new Error("resume_download_failed");
    const file = new File([await download.data.arrayBuffer()], version.data.original_filename, { type: version.data.mime_type });
    text = (await extractResumeFile(file)).extractedText;
  } catch {
    redirect(withNotice(returnTo, "resume_skills_failed"));
  }
  const stored = await supabase.rpc("store_my_resume_text", { target_version_id: versionId, target_text: text.slice(0, 100000) });
  if (stored.error) redirect(withNotice(returnTo, stored.error.message.includes("privacy_locked") ? "privacy_locked" : "resume_skills_failed"));
  revalidatePath(returnTo);
  redirect(withNotice(returnTo, "resume_skills_extracted"));
}
