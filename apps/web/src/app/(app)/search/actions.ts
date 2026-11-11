"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function rebuildSearchIndex() {
  const user = await requireUser();
  if (user.isMock) redirect("/search?notice=preview");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rebuild_my_search_documents");
  redirect(`/search?notice=${error ? "rebuild_failed" : "rebuilt"}`);
}
