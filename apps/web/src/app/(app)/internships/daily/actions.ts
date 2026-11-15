"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { initialDailyProfile } from "@/lib/jobs/daily-model";
export async function saveDailyDiscovery(_state:{message:string},form:FormData){
  const user=await requireUser();
  if(user.isMock)return {message:"预览模式不能保存。"};
  const profile=initialDailyProfile;
  const result=await(await createClient()).rpc("daily_discovery",{target_action:"save",payload:{profile,enabled:form.get("enabled")==="on"}});
  if(result.error)return {message:"保存失败，请检查隐私锁后重试。"};
  revalidatePath("/internships");
  return {message:form.get("enabled")==="on"?"已保存。每天09:00自动汇总，权限关闭时会暂停。":"已保存，每日发现已暂停。"};
}
