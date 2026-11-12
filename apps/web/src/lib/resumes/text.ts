import "server-only";

import { extractResumeFile } from "@/lib/resumes/file-intake";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

// The owner's stored resume text (D30). Versions uploaded before #16 have none yet: extract it from
// the stored file once and keep it, so later calls never re-read the file.
export async function loadResumeText(versionId: string) {
  const supabase = await createClient();
  const stored = await supabase.rpc("read_my_resume_text", { target_version_id: versionId });
  if (stored.error) throw new Error(stored.error.message);
  if (stored.data) return stored.data;
  const version = await supabase.from("resume_versions").select("storage_path,original_filename,mime_type").eq("id", versionId).maybeSingle();
  if (version.error || !version.data) throw new Error("resume_version_not_found");
  const download = await createServiceClient().storage.from("resume-files").download(version.data.storage_path);
  if (download.error || !download.data) throw new Error("resume_download_failed");
  const file = new File([await download.data.arrayBuffer()], version.data.original_filename, { type: version.data.mime_type });
  const text = (await extractResumeFile(file)).extractedText.slice(0, 100000);
  if (!text.trim()) throw new Error("pack_resume_text_required");
  const saved = await supabase.rpc("store_my_resume_text", { target_version_id: versionId, target_text: text });
  if (saved.error) throw new Error(saved.error.message);
  return text;
}
