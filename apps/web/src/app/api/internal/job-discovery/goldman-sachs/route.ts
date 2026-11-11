import { NextResponse } from "next/server";

import { scheduledRunId } from "@/lib/automation/scheduled-run";
import {
  GOLDMAN_SACHS_ADAPTER_VERSION,
  GOLDMAN_SACHS_SOURCE_DOMAIN,
  GOLDMAN_SACHS_SOURCE_KEY,
  runGoldmanSachsDiscovery,
  safeGoldmanSachsErrorCode
} from "@/lib/jobs/goldman-sachs";
import type { Json } from "@/lib/supabase/database.types";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 60;

async function finishFailedRun(runId: string, error: unknown) {
  const code = safeGoldmanSachsErrorCode(error);
  const service = createServiceClient();
  const cancelled = code === "job_discovery_permission_denied" || code === "job_source_not_enabled";
  await service.rpc("finish_job_source_run", {
    target_run_id: runId,
    target_status: cancelled ? "cancelled" : "failed",
    target_observed_count: 0,
    target_new_count: 0,
    target_updated_count: 0,
    target_error_code: code,
    target_coverage_gap: cancelled ? "permission_stopped_before_commit" : "official_source_not_committed"
  });
  return code;
}

export async function POST(request: Request) {
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
  const { data: run, error: runError } = await service.from("job_source_runs")
    .select("id,user_id,source_id,automation_run_id,status,created_at")
    .eq("id", runId)
    .eq("status", "running")
    .gte("created_at", cutoff)
    .maybeSingle();
  if (runError) {
    console.error("[goldman-sachs-discovery]", "source_run_read_failed");
    return NextResponse.json({ status: "failed", code: "source_run_read_failed" }, { status: 500 });
  }
  if (!run) return NextResponse.json({ status: "ignored" }, { status: 202 });

  const { data: claim, error: claimError } = await service.from("automation_runs").update({
    progress: 25,
    safe_checkpoint: "source_fetch_started"
  })
    .eq("id", run.automation_run_id)
    .eq("capability_key", "job_radar.discovery")
    .eq("status", "running")
    .eq("safe_checkpoint", "source_approved")
    .select("id")
    .maybeSingle();
  if (claimError) {
    console.error("[goldman-sachs-discovery]", "source_run_claim_failed");
    return NextResponse.json({ status: "failed", code: "source_run_claim_failed" }, { status: 500 });
  }
  if (!claim) return NextResponse.json({ status: "ignored" }, { status: 202 });

  const { data: source, error: sourceError } = await service.from("job_sources")
    .select("source_key,source_domain,adapter_version,approval_status,enabled")
    .eq("id", run.source_id)
    .eq("user_id", run.user_id)
    .maybeSingle();
  if (sourceError || !source
      || source.source_key !== GOLDMAN_SACHS_SOURCE_KEY
      || source.source_domain !== GOLDMAN_SACHS_SOURCE_DOMAIN
      || source.adapter_version !== GOLDMAN_SACHS_ADAPTER_VERSION
      || source.approval_status !== "approved"
      || !source.enabled) {
    const code = await finishFailedRun(run.id, new Error("goldman_sachs_source_contract_mismatch"));
    return NextResponse.json({ status: "failed", code }, { status: 500 });
  }

  try {
    const result = await runGoldmanSachsDiscovery();
    const { data, error } = await service.rpc("complete_goldman_sachs_job_source_run", {
      target_run_id: run.id,
      target_items: result.items as unknown as Json,
      target_status: result.status,
      target_coverage_gap: result.coverageGap,
      target_cursor_value: result.cursorValue,
      target_query_fingerprint: result.queryFingerprint
    });
    if (error) throw error;
    return NextResponse.json({ status: "ok", result: data });
  } catch (error) {
    const code = await finishFailedRun(run.id, error);
    console.error("[goldman-sachs-discovery]", code);
    return NextResponse.json({ status: "failed", code }, { status: 500 });
  }
}
