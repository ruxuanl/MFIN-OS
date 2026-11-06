import { NextResponse } from "next/server";
import { scheduledRunId } from "@/lib/automation/scheduled-run";
import { runCalendarSync } from "@/lib/calendar/service";
import { CalendarProviderError } from "@/lib/calendar/google-calendar";
import { getCalendarOAuthConfig, isCalendarServerConfigured } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!isCalendarServerConfigured()) return NextResponse.json({ status: "not_configured" }, { status: 503 });
  const payload = await request.json().catch(() => null);
  const runId = scheduledRunId(payload?.runId);
  if (!runId) return NextResponse.json({ status: "ignored" }, { status: 202 });
  const service = createServiceClient();
  const { data: run, error } = await service.from("automation_runs").update({
    status: "running", progress: 10, safe_checkpoint: "calendar_sync_started"
  }).eq("id", runId).eq("capability_key", "calendar.read").eq("status", "queued")
    .eq("safe_checkpoint", "cron_dispatched")
    .gte("created_at", new Date(Date.now() - 5 * 60_000).toISOString())
    .select("id,user_id").maybeSingle();
  if (error) return NextResponse.json({ status: "failed", code: "calendar_run_claim_failed" }, { status: 500 });
  if (!run) return NextResponse.json({ status: "ignored" }, { status: 202 });
  try {
    const oauth = getCalendarOAuthConfig();
    const result = await runCalendarSync(run.user_id, oauth, new URL(oauth.redirectUri).origin);
    console.info("[calendar-cron]", "calendar_read_complete");
    const { error: finishError } = await service.from("automation_runs").update({
      status: "succeeded", progress: 100, safe_checkpoint: "calendar_synced",
      result_reference: { ...result }, finished_at: new Date().toISOString()
    }).eq("id", run.id).select("id").single();
    if (finishError) throw finishError;
    console.info("[calendar-cron]", "calendar_run_finished");
    return NextResponse.json({ status: "ok", ...result });
  } catch (failure) {
    const candidate = failure instanceof CalendarProviderError
      ? `calendar_api_${failure.status}_${failure.providerCode}`
      : failure instanceof Error ? failure.message : "";
    const code = /^calendar_[a-z0-9_:.-]{1,96}$/i.test(candidate) ? candidate : "calendar_sync_failed";
    const outcomes = await Promise.all([
      service.from("automation_runs").update({ status: "failed", last_error_code: code,
        safe_checkpoint: "calendar_sync_failed", finished_at: new Date().toISOString() }).eq("id", run.id),
      service.from("external_connections").update({ last_error_code: code,
        last_error_at: new Date().toISOString() }).eq("user_id", run.user_id).eq("provider", "calendar")
    ]);
    console.error("[calendar-cron]", outcomes.some((item) => item.error) ? "calendar_failure_record_failed" : code);
    return NextResponse.json({ status: "failed", code }, { status: 500 });
  }
}
