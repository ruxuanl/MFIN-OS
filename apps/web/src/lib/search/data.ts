import "server-only";

import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import type { SearchParams } from "./params";

export type SearchResult = Database["public"]["Functions"]["search_my_workspace"]["Returns"][number];
export type SearchOutcome = { status: "ok"; results: SearchResult[] } | { status: "privacy_locked" } | { status: "mock" } | { status: "error" };

export async function searchWorkspace(user: AppUser, params: SearchParams): Promise<SearchOutcome> {
  if (user.isMock) return { status: "mock" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("search_my_workspace", {
    target_query: params.query,
    target_types: params.types.length ? params.types : undefined,
    target_track: params.track ?? undefined,
    target_stage: params.stage ?? undefined,
    target_company: params.company ?? undefined,
    target_location: params.location ?? undefined,
    target_deadline_from: params.deadlineFrom ?? undefined,
    target_deadline_to: params.deadlineTo ?? undefined,
    target_limit: 50
  });
  if (error) return { status: error.message.toLocaleLowerCase("en-US").includes("privacy_locked") ? "privacy_locked" : "error" };
  return { status: "ok", results: data ?? [] };
}
