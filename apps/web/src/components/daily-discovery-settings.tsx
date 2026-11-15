"use client";
import { useActionState } from "react";
import { saveDailyDiscovery } from "@/app/(app)/internships/daily/actions";
export function DailyDiscoverySettings({settings}:{settings:{enabled:boolean;profile:string}|null}){
  const [state,action,pending]=useActionState(saveDailyDiscovery,{message:""});
  return <details className="daily-settings"><summary>定时设置</summary>
    <form action={action} className="form-stack">
      <p>固定方向：二级买方投研、二级卖方研究、一级 PEVC。岗位含金量由 AI 根据原文判断。</p>
      <label><input type="checkbox" name="enabled" defaultChecked={settings?.enabled??false}/>每天北京时间 09:00 自动发现并汇总</label>
      <p>沿用最近一次实习搜索的地区和类型，检索最近7天公开岗位。每日精选最多5个，宁缺毋滥。可随时取消勾选暂停。</p>
      <p>当前在本机定时运行，电脑需开机且 MFIN OS 服务运行。错过时在恢复后生成当天报告，不补跑历史。</p>
      <button className="button primary" type="submit" disabled={pending} aria-busy={pending}>{pending?"正在保存…":"保存设置"}</button>
      <p role="status">{state.message}</p>
    </form>
  </details>;
}
