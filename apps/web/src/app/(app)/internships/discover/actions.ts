"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { isOpenAiConfigured } from "@/lib/config";
import { explainRadarItems, getRadarAiConfig } from "@/lib/jobs/radar-ai";
import { parseRadarPreferences } from "@/lib/jobs/radar-model";
import { searchInternships } from "@/lib/jobs/tavily";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/database.types";

export type RadarActionState = { message: string; ok: boolean };
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
    const preferences = parseRadarPreferences(Object.fromEntries(form.entries()));
    if (form.get("confirmed") !== "on") throw new Error("invalid_conditions");
    if (!process.env.TAVILY_API_KEY) throw new Error("search_not_configured");
    const start = await supabase.rpc("manual_radar", { target_action: "start", payload: preferences });
    if (start.error || typeof start.data !== "string") throw start.error ?? new Error("start_failed");
    runId = start.data;
    items = await searchInternships(preferences);
    const check = await supabase.rpc("manual_radar", { target_action: "check", payload: { runId } });
    if (check.error) throw check.error;
    if (items.length && isOpenAiConfigured()) {
      try {
        const config = getRadarAiConfig();
        const fingerprint = createHash("sha256").update(JSON.stringify({ preferences, items, runId })).digest("hex");
        const reserve = await supabase.rpc("manual_radar", { target_action: "reserve_ai", payload: { runId, fingerprint, provider: config.provider, reserve: config.reserveHkdCents } });
        if (reserve.error) throw reserve.error;
        const ai = await explainRadarItems(preferences.profile, items);
        items = ai.items; aiUsage = ai.usage;
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
    return { ok: true, message: items.length ? `本轮取得 ${items.length} 条真实检索结果，尚未加入候选。${aiWarning}` : "本轮没有找到结果，请调整岗位条件。" };
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
  const supabase = await createClient();
  const result = await supabase.rpc("manual_radar", { target_action: action, payload: { id: String(form.get("id")), company: String(form.get("company") ?? ""), title: String(form.get("title") ?? "") } });
  if (result.error) return { ok: false, message: safeError(result.error) };
  revalidatePath("/internships"); revalidatePath("/internships/discover");
  return { ok: true, message: action === "add" ? "已加入候选池。" : "已忽略，未写入候选池。" };
}
