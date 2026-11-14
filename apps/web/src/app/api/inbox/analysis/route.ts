import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { runMailAnalysisBatch } from "@/lib/gmail/insight-worker";
export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request: Request) {
  if(request.headers.get("origin")!==new URL(request.url).origin) return NextResponse.json({ status: "denied" },{ status: 403 });
  const user=await requireUser();
  if(user.isMock) return NextResponse.json({ processed: 0,status: "idle" });
  return NextResponse.json(await runMailAnalysisBatch(user.id));
}
