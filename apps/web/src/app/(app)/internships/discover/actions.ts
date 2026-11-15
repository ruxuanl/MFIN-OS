"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isOpenAiConfigured } from "@/lib/config";
import { explainRadarItems, getRadarAiConfig } from "@/lib/jobs/radar-ai";
import { parseRadarPreferences, reuseRadarEvidence, type RadarSnapshot } from "@/lib/jobs/radar-model";
import { searchInternships } from "@/lib/jobs/tavily";
import { matchesRadarPreferences, filteredRadarItems, selectRadarEvidence } from "@/lib/jobs/radar-results";
import { radarSourceTime } from "@/lib/jobs/radar-source-time";
import { requireRadarSourceAccess } from "@/lib/jobs/radar-access";
import { searchLeadershipLocal, leadershipItem, leadershipLock, leadershipDecisions, saveLeadershipDecision } from "@/lib/jobs/leadership-local";
import { enrichRadarPageTimes } from "@/lib/jobs/radar-page-time";
import { radarJobLocation } from "@/lib/jobs/radar-location";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

export type RadarActionState = { message: string; ok: boolean; decision?:"added"|"ignored"; localItems?: RadarSnapshot["items"]; localStats?: RadarSnapshot["localStats"] };
function safeError(error: unknown) {
  const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  const labels: Record<string, string> = {
    search_not_configured: "尚未配置 Tavily 服务端密钥。", search_key_invalid: "搜索密钥无效，请在本机重新配置。",
    search_unavailable: "搜索服务暂不可用或超时，请稍后手动重试。", search_invalid_response: "搜索服务返回格式异常。",
    search_limit: "搜索服务额度或频率受限。", radar_busy: "已有搜索进行中，或距上一轮不足 60 秒。",
    radar_daily_limit: "已达到 24 小时内 20 轮搜索上限。", privacy_locked: "隐私锁已阻止操作。",
    radar_permission_denied: "请在设置中开启求职雷达及岗位发现权限（持续或限时）。",
    invalid_conditions: "请核对搜索条件；搜索字段只填写公开岗位条件，不填写联系方式。",
    job_closed: "该岗位已关闭，不能加入候选。", result_not_found: "发现结果不存在或无权访问。"
  };
  return Object.entries(labels).find(([key]) => message.includes(key))?.[1] ?? "操作失败，结果未确认保存。请刷新后重试。";
}
export async function discoverInternships(_previous: RadarActionState, form: FormData): Promise<RadarActionState> {
  const user = await requireUser();
  if (user.isMock) return { ok: false, message: "请使用真实登录；预览模式不能联网搜索。" };
  const supabase = await createClient();
  let runId: string | null = null;
  let items: Awaited<ReturnType<typeof searchInternships>> = [];
  let aiUsage: Json | undefined;
  let aiWarning = "";
  try {
    const preferences = parseRadarPreferences({ ...Object.fromEntries(form.entries()), ...Object.fromEntries(["direction", "region", "internshipType", "publishedWithin"].map(key => [key, form.getAll(key).join(",")])) });
    if(preferences.source==="local"){
      await requireRadarSourceAccess(user.id);
      const local=await searchLeadershipLocal(user.id,preferences);
      return {ok:local.available,message:local.available?`已检索 ${local.files} 份本地汇总表，找到 ${local.items.length} 个符合条件的岗位；按文件标题日期筛选，未调用联网搜索或AI。`:local.message??"本地LEADERSHIP渠道尚未配置。",localItems:local.items,localStats:{files:local.files,records:local.records,available:local.available,message:local.message}};
    }

    if (!process.env.TAVILY_API_KEY) throw new Error("search_not_configured");
    const start = await supabase.rpc("manual_radar", { target_action: "start", payload: preferences });
    if (start.error || typeof start.data !== "string") throw start.error ?? new Error("start_failed");
    runId = start.data;
    items = selectRadarEvidence((await searchInternships(preferences)).filter(item => !radarJobLocation(item)||matchesRadarPreferences(item, preferences)));
    const check = await supabase.rpc("manual_radar", { target_action: "check", payload: { runId } });
    if (check.error) throw check.error;
    const original = await supabase.rpc("manual_radar", { target_action: "read" });
    if (original.error) throw original.error;
    items = reuseRadarEvidence(items, (original.data as unknown as RadarSnapshot)?.items ?? []);
    items = await enrichRadarPageTimes(items);
    items = selectRadarEvidence(items.filter(item => matchesRadarPreferences(item, preferences)));
    if (items.length && isOpenAiConfigured()) {
      try {
        const config = getRadarAiConfig();
        const fingerprint = createHash("sha256").update(JSON.stringify({ preferences, items, runId })).digest("hex");
        const reserve = await supabase.rpc("manual_radar", { target_action: "reserve_ai", payload: { runId, fingerprint, provider: config.provider, reserve: config.reserveHkdCents } });
        if (reserve.error) throw reserve.error;
        const ai = await explainRadarItems([preferences.direction, preferences.region, preferences.internshipType].join("；"), items);
        items = ai.items; aiUsage = ai.usage; aiWarning = ai.warning ? ` ${ai.warning}` : "";
      } catch (error) {
        const detail = error instanceof Error && ["ai_incomplete_response", "ai_invalid_result", "ai_usage_unsettled"].includes(error.message)
          ? error.message : error && typeof error === "object" && "status" in error && typeof error.status === "number" ? `provider_http_${error.status}` : "permission_budget_or_transport";
        console.warn("[radar-ai]", detail);
        aiWarning = ` AI 暂未生成（${detail}），已保留真实搜索证据供人工核对；计费不确定的请求保留预算预留。`;
      }
    } else if (items.length) aiWarning = " AI 未配置，保留搜索证据供人工核对。";
    const finish = await createServiceClient().rpc("finish_manual_radar", { target_run_id: runId, target_items: items as unknown as Json, target_error: null, target_ai: aiUsage });
    if (finish.error) throw finish.error;
    const finalCheck = await supabase.rpc("manual_radar", { target_action: "read" });
    const snapshot = finalCheck.data as { runs?: { id: string; status: string }[] } | null;
    if (snapshot?.runs?.find(x => x.id === runId)?.status !== "completed") throw new Error("radar_permission_denied");
    revalidatePath("/internships/discover");
    revalidatePath("/internships");
    const displayItems = filteredRadarItems(items, preferences);
    const datedCount = displayItems.filter(item => radarSourceTime(item)).length;
    return { ok: true, message: displayItems.length ? `本轮整理 ${displayItems.length} 个具体岗位：${datedCount} 条有来源日期，${displayItems.length - datedCount} 条未取得来源日期而隐藏，尚未加入候选。${aiWarning}` : `本轮暂无符合筛选且信息足够的具体实习岗位，请调整条件后重试。${aiWarning}` };
  } catch (error) {
    if (runId) await createServiceClient().rpc("finish_manual_radar", { target_run_id: runId, target_items: items as unknown as Json, target_error: "search_or_save_failed", target_ai: aiUsage });
    revalidatePath("/internships/discover");
    revalidatePath("/internships");
    return { ok: false, message: safeError(error) };
  }
}
export async function decideDiscovery(_previous: RadarActionState, form: FormData): Promise<RadarActionState> {
  const user = await requireUser();
  if (user.isMock) return { ok: false, message: "预览模式不能写入。" };
  const action = form.get("decision");
  if (action !== "add" && action !== "ignore") return { ok: false, message: "无效操作。" };
  const localId=String(form.get("id")??"");
  if(localId.startsWith("leadership:")){
    try{return await leadershipLock(user.id,async()=>{
      const client=await requireRadarSourceAccess(user.id);
      const item=await leadershipItem(user.id,localId);
      if(action==="ignore"){await saveLeadershipDecision(user.id,localId,"ignored");revalidatePath("/internships");return {ok:true,decision:"ignored" as const,message:"已忽略这条本地来源。"};}
      if((await leadershipDecisions(user.id))[localId]==="added")return {ok:true,decision:"added" as const,message:"该岗位已加入候选。"};
      const company=String(form.get("company")??item.company).trim(),title=String(form.get("title")??item.title).trim();
      if(!company||!title||company.length>240||title.length>240)throw new Error("invalid_conditions");
      const marker=`[LEADERSHIP:${item.localSource.key}]`;
      const prior=await client.from("opportunity_candidates").select("id").eq("user_id",user.id).eq("track","internship").like("source_summary",marker+"%").limit(1);
      if(prior.error)throw prior.error;
      let exists=Boolean(prior.data?.length);
      if(!exists&&item.localSource.publicUrl&&/\/(?:jobs?|positions?|vacanc(?:y|ies)|view|requisition)\/[^/?]+|[?&](?:jobid|job_id|gh_jid)=/i.test(item.localSource.publicUrl)){const byUrl=await client.from("opportunity_candidates").select("id").eq("user_id",user.id).eq("track","internship").eq("source_url",item.localSource.publicUrl).limit(1);if(byUrl.error)throw byUrl.error;exists=Boolean(byUrl.data?.length);}
      if(!exists){const saved=await client.from("opportunity_candidates").insert({user_id:user.id,track:"internship",company,role_title:title,location:radarJobLocation(item)??item.location,source_url:item.localSource.publicUrl,source_summary:(marker+"\n"+item.evidence).slice(0,1000)});if(saved.error)throw saved.error;}
      await saveLeadershipDecision(user.id,localId,"added");revalidatePath("/internships");return {ok:true,decision:"added" as const,message:exists?"该岗位已在候选池中，未重复添加。":"已将选中的本地岗位加入候选池。"};
    });}catch(error){return {ok:false,message:safeError(error)};}
  }
  const supabase = await createClient();
  const result = await supabase.rpc("manual_radar", { target_action: action, payload: { id: String(form.get("id")), company: String(form.get("company") ?? ""), title: String(form.get("title") ?? "") } });
  if (result.error) return { ok: false, message: safeError(result.error) };
  revalidatePath("/internships"); revalidatePath("/internships/discover");
  return { ok: true, decision:action==="add"?"added":"ignored", message: action === "add" ? "已加入候选池。" : "已忽略，未写入候选池。" };
}
