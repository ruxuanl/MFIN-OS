import { NextResponse } from "next/server";
import { scheduledRunId } from "@/lib/automation/scheduled-run";
import { createServiceClient } from "@/lib/supabase/service";
import { runMailAnalysisBatch } from "@/lib/gmail/insight-worker";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request: Request) {
  let payload: unknown;
  try { payload=await request.json(); } catch { payload=null; }
  const runId=scheduledRunId(payload && typeof payload==="object" && "runId" in payload ? payload.runId : null);
  if(!runId) return NextResponse.json({ status: "ignored" },{ status: 202 });
  const service=createServiceClient();
  const { data: run,error }=await service.from("automation_runs").update({ status: "running",safe_checkpoint: "mail_analysis_started" })
    .eq("id",runId).eq("capability_key","gmail.analysis").eq("status","queued").eq("safe_checkpoint","cron_dispatched")
    .gte("created_at",new Date(Date.now()-5*60_000).toISOString()).select("id,user_id").maybeSingle();
  if(error) return NextResponse.json({ status: "failed" },{ status: 500 });
  if(!run) return NextResponse.json({ status: "ignored" },{ status: 202 });
  const result=await runMailAnalysisBatch(run.user_id);
  const { error: finishError }=await service.from("automation_runs").update({ status: result.status==="failed" ? "failed" : result.status==="paused" ? "cancelled" : "succeeded",
    safe_checkpoint: "mail_analysis_finished",progress: 100,result_reference: result,finished_at: new Date().toISOString() }).eq("id",run.id);
  return NextResponse.json({ ...result,status: finishError ? "failed" : result.status });
}
