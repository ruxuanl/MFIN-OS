import { cache } from "react";

import { createClient } from "./supabase/server";
import { deriveNavigationUpdateHrefs } from "./navigation-update-model";

export const getNavigationUpdateHrefs = cache(async (userId: string, isMock: boolean) => {
  if (isMock) return new Set<string>();

  const supabase = await createClient();
  const results = await Promise.all([
    supabase.from("opportunity_candidates").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("track", "internship").eq("decision_status", "candidate"),
    supabase.from("opportunity_candidates").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("track", "graduate").eq("decision_status", "candidate"),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending").eq("classification", "academic"),
    supabase.from("inbox_items").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
    supabase.from("calendar_sync_conflicts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
    supabase.from("calendar_sync_operations").select("id", { count: "exact", head: true }).eq("user_id", userId).in("status", ["pending", "processing", "failed", "conflict"]),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null),
    supabase.from("external_connections").select("id", { count: "exact", head: true }).eq("user_id", userId).not("last_error_code", "is", null),
    supabase.from("job_sources").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("enabled", true).in("health_status", ["degraded", "failed"]).then((result) => result.error?.code === "PGRST205" ? { ...result, count: 0, error: null } : result)
  ]);

  if (results.some((result) => result.error)) {
    console.error("[navigation-updates] update query failed");
    return new Set<string>(["/status"]);
  }

  return deriveNavigationUpdateHrefs({
    internshipCandidates: results[0].count ?? 0,
    graduateCandidates: results[1].count ?? 0,
    academicInbox: results[2].count ?? 0,
    pendingInbox: results[3].count ?? 0,
    calendarConflicts: results[4].count ?? 0,
    calendarOperations: results[5].count ?? 0,
    unreadNotifications: results[6].count ?? 0,
    connectionErrors: results[7].count ?? 0,
    sourceErrors: results[8].count ?? 0
  });
});
