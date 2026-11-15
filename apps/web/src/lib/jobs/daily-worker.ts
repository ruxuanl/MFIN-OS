import "server-only";
import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import { searchInternships } from "./tavily";
import { parseRadarPreferences, type RadarItem } from "./radar-model";
import { matchesRadarPreferences, selectRadarEvidence } from "./radar-results";
import { enrichRadarPageTimes } from "./radar-page-time";
import { radarJobLocation } from "./radar-location";
import { getRadarAiConfig } from "./radar-ai";
import { rankDailyItems } from "./daily-ai";
import { selectDailyRecommendations } from "./daily-model";

export async function runDailyDiscovery(userId: string, options: { immediate?: boolean } = {}) {
  const service=createServiceClient();
  const work=async(action:string,payload:unknown={})=>{
    const r=await service.rpc("daily_discovery_work",{target_user_id:userId,target_action:action,payload:payload as Json});
    if(r.error)throw new Error(r.error.message);return r.data;
  };
  let runId:string|undefined,usage:Json|undefined,items:RadarItem[]=[];
  try{
    const claim=await work("claim",options.immediate?{immediate:true}:{}) as {runId:string;profile:string;preferences:Record<string,unknown>}|null;
    if(!claim)return {status:"skipped"};
    runId=claim.runId;
    const preferences=parseRadarPreferences(claim.preferences);
    const config=getRadarAiConfig();
    await work("check",{runId});
    items=selectRadarEvidence((await searchInternships(preferences)).filter(item=>!radarJobLocation(item)||matchesRadarPreferences(item,preferences)));
    await work("check",{runId});
    items=selectRadarEvidence((await enrichRadarPageTimes(items)).filter(item=>matchesRadarPreferences(item,preferences)));
    const known=await service.from("opportunity_candidates").select("source_url").eq("user_id",userId).eq("track","internship");
    if(known.error)throw new Error("candidate_read_failed");
    let recommendations:ReturnType<typeof selectDailyRecommendations>=[];
    let incomplete=false;
    if(items.length){
      const fingerprint=createHash("sha256").update(JSON.stringify({runId,profile:claim.profile,items})).digest("hex");
      await work("reserve_ai",{runId,fingerprint,provider:config.provider,reserve:config.reserveHkdCents});
      await work("check",{runId});
      const ai=await rankDailyItems(claim.profile,items);usage=ai.usage;
      items=items.map(item=>ai.items.find(r=>r.url===item.url)??item);
      incomplete=!ai.valid;
      recommendations=selectDailyRecommendations(ai.items,new Set((known.data??[]).flatMap(c=>c.source_url?[c.source_url]:[])));
    }
    // The original radar finalizer settles known usage and rechecks permission.
    const saved=await service.rpc("finish_manual_radar",{target_run_id:runId,target_items:items as unknown as Json,target_error:null,target_ai:usage});
    if(saved.error)throw new Error("radar_save_failed");
    await work("finish",{runId,recommendations,error:incomplete?"ai_incomplete_response":null});
    return {status:incomplete?"failed":"completed",count:recommendations.length};
  }catch(error){
    const message=error instanceof Error?error.message:"";
    const code=/privacy|permission|settings_changed/.test(message)?"permission_or_settings_changed":/budget/.test(message)?"budget_exceeded":/configured/.test(message)?"provider_not_configured":"discovery_failed";
    if(runId){
      await service.rpc("finish_manual_radar",{target_run_id:runId,target_items:items as unknown as Json,target_error:code,target_ai:usage});
      await work("finish",{runId,error:code,recommendations:[]}).catch(()=>undefined);
    }
    return {status:"failed",code};
  }
}
