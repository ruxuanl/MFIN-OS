import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDailyDiscovery } from "@/lib/jobs/daily-worker";

export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){
  const secret=process.env.DAILY_DISCOVERY_SECRET;
  const token=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
  if(!secret||Buffer.byteLength(token)!==Buffer.byteLength(secret)||!timingSafeEqual(Buffer.from(token),Buffer.from(secret)))return NextResponse.json({status:"unauthorized"},{status:401});
  const owner=process.env.DAILY_DISCOVERY_OWNER_ID;
  if(!owner||!/^[0-9a-f-]{36}$/i.test(owner))return NextResponse.json({status:"not_configured"},{status:503});
  const result=await runDailyDiscovery(owner,{immediate:new URL(request.url).searchParams.get("immediate")==="1"});
  return NextResponse.json(result,{status:result.status==="failed"?503:200});
}
