import type { AppUser } from "@/lib/auth/types";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Tables = Database["public"]["Tables"];
export type Report = Tables["reports"]["Row"];
export type ReportItem = Tables["report_items"]["Row"];
export type ReportSchedule = Tables["report_schedules"]["Row"];
export type SmartNotification = Tables["notifications"]["Row"];

export type ReportCenterData = {
  isMock: boolean;
  schedules: ReportSchedule[];
  reports: Report[];
  items: ReportItem[];
  notifications: SmartNotification[];
  reportPermission: { allowed: boolean; reason: string };
};

export async function getReportCenterData(user: AppUser): Promise<ReportCenterData> {
  if (user.isMock) return { isMock: true, schedules: [], reports: [], items: [], notifications: [], reportPermission: { allowed: false, reason: "preview" } };
  const supabase = await createClient();
  const { error: scheduleError } = await supabase.rpc("ensure_my_report_schedules");
  if (scheduleError) throw scheduleError;

  const [scheduleResult, reportResult, notificationResult, permissionResult] = await Promise.all([
    supabase.from("report_schedules").select("*").order("report_type"),
    supabase.from("reports").select("*").in("status", ["ready", "empty"]).order("generated_at", { ascending: false }).limit(12),
    supabase.from("notifications").select("*").order("created_at", { ascending: false }).limit(8),
    supabase.rpc("get_my_permission_decision", { capability_key: "reports.generate" })
  ]);
  const firstError = [scheduleResult, reportResult, notificationResult, permissionResult].map((result) => result.error).find(Boolean);
  if (firstError) throw firstError;
  const reports = reportResult.data ?? [];
  const reportIds = reports.map((report) => report.id);
  const itemResult = reportIds.length
    ? await supabase.from("report_items").select("*").in("report_id", reportIds).order("section").order("position")
    : { data: [] as ReportItem[], error: null };
  if (itemResult.error) throw itemResult.error;
  const decision = permissionResult.data?.[0];
  return {
    isMock: false,
    schedules: scheduleResult.data ?? [],
    reports,
    items: itemResult.data ?? [],
    notifications: notificationResult.data ?? [],
    reportPermission: { allowed: Boolean(decision?.allowed), reason: decision?.reason ?? "grant_inactive" }
  };
}

