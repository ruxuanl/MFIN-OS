import { isResumeWorkspaceEnabled } from "@/lib/config";
import { NextResponse, type NextRequest } from "next/server";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) return NextResponse.json({ error: "workspace_unavailable" }, { status: 503 });
  if (user.isMock) return NextResponse.json({ error: "preview" }, { status: 404 });
  const { id } = await context.params;
  const supabase = await createClient();
  const version = await supabase.from("resume_versions").select("storage_path").eq("id", id).maybeSingle();
  if (version.error || !version.data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const signed = await supabase.storage.from("resume-files").createSignedUrl(version.data.storage_path, 60);
  if (signed.error || !signed.data) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  return NextResponse.redirect(signed.data.signedUrl);
}
