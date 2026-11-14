import "server-only";
import { createHash } from "node:crypto";
import { getOpenAiConfig } from "@/lib/config";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";
import { analyzeMailBatch, mailFingerprint } from "./insight-ai";
import { mailStandardVersion } from "./insight-model";
import { readGmailForAnalysis } from "./service";

type ClaimedMail = { id: string; providerId: string; token: string; fingerprint: string | null; hasResult: boolean };
export async function runMailAnalysisBatch(userId: string) {
  const service = createServiceClient();
  const work = async (action: string, payload: unknown = {}) => {
    const { data,error } = await service.rpc("gmail_insight_work", { target_user_id: userId,target_action: action,payload: payload as Json });
    if (error) throw new Error(error.message);
    return data;
  };
  let token: string | undefined;
  let code = "analysis_failed";
  try {
    const config = getOpenAiConfig();
    if (config.provider!=="deepseek") return { processed: 0,status: "unavailable" };
    const claimed = await work("claim") as ClaimedMail[];
    if (!claimed.length) {
      const { count,error }=await service.from("gmail_insights").select("message_id",{count:"exact",head:true}).eq("user_id",userId).in("status",["queued","running"]);
      if(error) throw new Error("mail_queue_unavailable");
      return { processed: 0,status: count ? "busy" : "idle" };
    }
    token = claimed[0].token;
    code = "mail_unavailable";
    const inputs = await Promise.all(claimed.map(async mail => {
      const projection = await readGmailForAnalysis(userId,mail.providerId);
      return { id: mail.id, subject: projection.subject,sender: projection.senderSummary ?? "",body: projection.body,receivedAt: projection.receivedAt };
    }));
    const fingerprints = new Map(inputs.map(input=>[input.id,mailFingerprint(input)]));
    const cached = claimed.filter(mail=>mail.hasResult && mail.fingerprint===fingerprints.get(mail.id));
    if (cached.length) await work("cached",{ token,results: cached.map(mail=>({ id: mail.id,fingerprint: mail.fingerprint })) });
    const pending = inputs.filter(input=>!cached.some(mail=>mail.id===input.id));
    if (!pending.length) return { processed: inputs.length,status: "completed" };
    code = "budget_exceeded";
    const usageId = await work("reserve",{ token,fingerprint: createHash("sha256").update(pending.map(x=>fingerprints.get(x.id)).sort().join()).digest("hex"),reserve: config.reserveHkdCents,provider: config.provider });
    await work("check");
    code = "analysis_failed";
    const response = await analyzeMailBatch(pending);
    const saved = await work("finish",{ token,usageId,usage: response.usage,standardVersion: mailStandardVersion,
      results: response.results?.map(r=>({ ...r,fingerprint: fingerprints.get(r.id) })) ?? [] });
    if (!response.results) throw new Error("mail_ai_invalid_result");
    return { processed: inputs.length,status: saved ? "completed" : "paused" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("permission")) code="permission_denied";
    if (token) await work("fail",{ token,code }).catch(()=>undefined);
    return { processed: 0,status: code==="permission_denied" ? "paused" : "failed" };
  }
}
