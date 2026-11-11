import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type CalendarSource = Tables["calendar_sources"]["Row"];
export type CalendarEvent = Tables["calendar_events"]["Row"];
export type CalendarEventLink = Tables["calendar_event_links"]["Row"];
export type CalendarSyncOperation = Tables["calendar_sync_operations"]["Row"];
export type CalendarSyncConflict = Tables["calendar_sync_conflicts"]["Row"];
export type CalendarAction = Tables["actions"]["Row"];

export type CalendarCenterData = {
  isMock: boolean;
  connection: { status: string; grantedScopes: string[]; lastSuccessAt: string | null; lastErrorCode: string | null } | null;
  sources: CalendarSource[];
  events: CalendarEvent[];
  links: CalendarEventLink[];
  operations: CalendarSyncOperation[];
  conflicts: CalendarSyncConflict[];
  actions: CalendarAction[];
};

export async function getCalendarCenterData(user: AppUser): Promise<CalendarCenterData> {
  if (user.isMock) return {
    isMock: true,
    connection: null,
    sources: [], events: [], links: [], operations: [], conflicts: [], actions: []
  };
  const supabase = await createClient();
  const [connection, sources, events, links, operations, conflicts, actions] = await Promise.all([
    supabase.from("external_connections").select("status,granted_scopes,last_success_at,last_error_code")
      .eq("provider", "calendar").maybeSingle(),
    supabase.from("calendar_sources").select("*").order("is_product_calendar", { ascending: false }).order("summary"),
    supabase.from("calendar_events").select("*").eq("deleted", false)
      .order("starts_at", { ascending: true, nullsFirst: false }).order("starts_on", { ascending: true, nullsFirst: false }).limit(50),
    supabase.from("calendar_event_links").select("*").order("updated_at", { ascending: false }),
    supabase.from("calendar_sync_operations").select("*").in("status", ["pending", "processing", "failed", "conflict"])
      .order("created_at"),
    supabase.from("calendar_sync_conflicts").select("*").eq("status", "pending").order("created_at"),
    supabase.from("actions").select("*").neq("status", "cancelled").order("due_at", { ascending: true, nullsFirst: false })
  ]);
  const error = [connection, sources, events, links, operations, conflicts, actions].map((result) => result.error).find(Boolean);
  if (error) throw error;
  return {
    isMock: false,
    connection: connection.data ? {
      status: connection.data.status,
      grantedScopes: connection.data.granted_scopes,
      lastSuccessAt: connection.data.last_success_at,
      lastErrorCode: connection.data.last_error_code
    } : null,
    sources: sources.data ?? [],
    events: events.data ?? [],
    links: links.data ?? [],
    operations: operations.data ?? [],
    conflicts: conflicts.data ?? [],
    actions: actions.data ?? []
  };
}
