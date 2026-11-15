import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueBriefs, generateBrief } from "@/lib/reports/archive";
export const runtime="nodejs";
export const maxDuration=180;
export async function POST(request:Request){
 const secret=process.env.REPORT_SCHEDULER_SECRET;
 const token=request.headers.get("authorization")?.replace(/^Bearer /,"")??"";
 if(!secret || Buffer.byteLength(secret)!==Buffer.byteLength(token) || !timingSafeEqual(Buffer.from(secret),Buffer.from(token)))return NextResponse.json({status:"unauthorized"},{status:401});
 const owner=process.env.REPORT_OWNER_ID;if(!owner)return NextResponse.json({status:"not_configured"},{status:503});
 try {
  const mode=new URL(request.url).searchParams.get("generate");
  if(mode==="daily" || mode==="weekly") {const b=await generateBrief(owner,mode);return NextResponse.json({status:"completed",id:b.id,date:b.date});}
  await runDueBriefs(owner);return NextResponse.json({status:"completed"});
 } catch(e) {const message=e instanceof Error?e.message:"";return NextResponse.json({status:"failed",code:/^[a-zA-Z0-9_]{1,100}$/.test(message)?message:"report_generation_failed"},{status:503});}
}
