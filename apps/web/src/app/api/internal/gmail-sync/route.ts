import { NextResponse } from "next/server";

import { scheduledRunId } from "@/lib/automation/scheduled-run";
import { getGmailOAuthConfig, isGmailServerConfigured } from "@/lib/config";
import { safeGmailErrorCode } from "@/lib/gmail/errors";
import { runGmailSync, type GmailSyncResult } from "@/lib/gmail/service";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

async function finishRun(runId: string, result: GmailSyncResult) {
  const service = createServiceClient();
  const { error } = await service.from("automation_runs").update({
    status: "succeeded",
    progress: 100,
    safe_checkpoint: result.complete ? "gmail_cursor_advanced" : "gmail_batch_checkpointed",
    result_reference: {
      fetched: result.fetched,
      created: result.created,
      pending: result.pending,
      updated: result.updated,
      fullSync: result.fullSync,
      complete: result.complete
    },
    last_error_code: null,
    last_error_summary: null,
    finished_at: new Date().toISOString()
  }).eq("id", runId).select("id").single();
  if (error) throw error;
}

async function failRun(runId: string, userId: string, error: unknown) {
  const code = safeGmailErrorCode(error);
  const service = createServiceClient();
  const outcomes = await Promise.all([
    service.from("automation_runs").update({
      status: "failed",
      safe_checkpoint: "gmail_sync_failed",
      last_error_code: code,
      last_error_summary: "Scheduled Gmail sync stopped before cursor commit.",
      finished_at: new Date().toISOString()
    }).eq("id", runId),
    service.from("external_connections").update({
      last_error_code: code,
      last_error_at: new Date().toISOString()
    }).eq("user_id", userId).eq("provider", "gmail")
  ]);
  if (outcomes.some((outcome) => outcome.error)) throw new Error("gmail_run_failure_record_failed");
  return code;
}

export async function POST(request: Request) {
  if (!isGmailServerConfigured()) {
    return NextResponse.json({ status: "not_configured" }, { status: 503 });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch { payload = null; }
  const runId = scheduledRunId(
    payload && typeof payload === "object" && "runId" in payload
      ? (payload as { runId?: unknown }).runId
      : null
  );
  if (!runId) return NextResponse.json({ status: "ignored" }, { status: 202 });

  const service = createServiceClient();
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: run, error: startError } = await service.from("automation_runs").update({
    status: "running",
    progress: 10,
    safe_checkpoint: "gmail_sync_started"
  })
    .eq("id", runId)
    .eq("capability_key", "gmail.sync")
    .eq("status", "queued")
    .eq("safe_checkpoint", "cron_dispatched")
    .gte("created_at", cutoff)
    .select("id,user_id")
    .maybeSingle();
  if (startError) {
    console.error("[gmail-cron]", "gmail_run_claim_failed");
    return NextResponse.json({ status: "failed", code: "gmail_run_claim_failed" }, { status: 500 });
  }
  if (!run) return NextResponse.json({ status: "ignored" }, { status: 202 });

  try {
    const result = await runGmailSync(run.user_id, getGmailOAuthConfig());
    await finishRun(run.id, result);
    return NextResponse.json({ status: "ok", ...result });
  } catch (error) {
    const code = await failRun(run.id, run.user_id, error);
    console.error("[gmail-cron]", code);
    return NextResponse.json({ status: "failed", code }, { status: 500 });
  }
}
