import Link from "next/link";
import { Icon } from "@/components/icon";
import { requireUser } from "@/lib/auth/session";
import { listBriefs, getSchedules, canGenerate, reportAutomationFailed } from "@/lib/reports/archive";
import { defaultSchedules } from "@/lib/reports/archive-model";
import { generateArchiveAction, saveArchiveSchedule } from "@/app/(app)/reports/actions";
import { SubmitButton } from "@/components/operation-feedback";
import { getReportCenterData } from "@/lib/reports/data";
import { ReportSection } from "@/components/report-section";
import { groupReportItems, reportLabels } from "@/lib/reports/model";
import "./review.css";
export const metadata={title:"日报与周报"};
export default async function ReviewPage({searchParams}:{searchParams:Promise<{type?:string;id?:string;notice?:string}>}) {
 const user=await requireUser(),params=await searchParams;
 const automationFailed=!user.isMock && await reportAutomationFailed(user.id);
 const [briefs,schedules,allowed,legacy]=user.isMock?[[],defaultSchedules,false,null] as const:await Promise.all([listBriefs(user.id),getSchedules(user.id),canGenerate(user.id),getReportCenterData(user)]);
 const type=params.type==="weekly"?"weekly":"daily";
 const records=Map.groupBy(briefs.filter(b=>b.type===type),b=>b.date);
 const notices:Record<string,string>={generated:"报告与 PDF 已存入档案。",schedule_saved:"生成计划已保存。",generate_failed:"本次未完成，已有档案仍保留。请检查报告权限、预算和本地服务后重试。",schedule_failed:"计划未保存，请重试。"};
 return <div className="page-shell review-editions">
  <header className="edition-heading"><div><h1>报告档案</h1><p>按日留存，随时回看。打开原始 PDF，阅读完整报告。</p></div><form action={generateArchiveAction}><input type="hidden" name="type" value={type}/><SubmitButton className="primary-button" disabled={!allowed} pendingLabel="正在分析并存档…">生成{type==="daily"?"今天的日报":"本周周报"}</SubmitButton></form></header>
  {params.notice&&notices[params.notice]?<p className="status-notice" role="status">{notices[params.notice]}</p>:null}
  {automationFailed?<p className="status-notice" role="status">今天的自动报告未完成。为避免重复费用，系统已停止重试；检查权限与本地服务后，可在上方手动生成。</p>:null}
  {!allowed?<p className="status-notice">请在<Link href="/status">状态中心</Link>开启 AI 总开关与报告权限，并解除隐私锁。</p>:null}
  <details className="edition-settings"><summary>自动生成与 PDF 归档 <span>日报 {schedules[0].time} · 周日 {schedules[1].time}</span></summary><p>北京时间。电脑和本地服务需保持可用；错过时间后当天补生成一次，失败后可手动重试。</p><div className="edition-schedules">{schedules.map(s=><form key={s.type} action={saveArchiveSchedule}><strong>{s.type==="daily"?"每日日报":"每周周日"}</strong><input type="hidden" name="type" value={s.type}/><label>生成时间<input type="time" name="time" defaultValue={s.time} required/></label><label><input type="checkbox" name="enabled" defaultChecked={s.enabled}/>自动生成</label><SubmitButton className="quiet-button" pendingLabel="保存中…">保存计划</SubmitButton></form>)}</div></details>
  <nav className="edition-tabs" aria-label="报告类型">{(["daily","weekly"] as const).map(t=><Link key={t} href={`/review?type=${t}`} aria-current={type===t?"page":undefined}>{t==="daily"?"日报":"周报"} <span>{new Set(briefs.filter(b=>b.type===t).map(b=>b.date)).size}</span></Link>)}</nav>
  <section className="edition-records" aria-label={type==="daily"?"日报记录":"周报记录"}>
   <div className="edition-list-heading"><h2>{type==="daily"?"每日日报":"每周周报"}</h2><span>{records.size} 条记录 · 按日期倒序</span></div>
   {records.size?<div className="edition-record-list">{Array.from(records,([date,versions])=>{
    const latest=versions[0],label=type==="daily"?"日报":"周报";
    return <article key={date} id={`report-${date}`} className={`edition-record${versions.some(b=>b.id===params.id)?" is-current":""}`} aria-labelledby={`title-${date}`}>
     <div className="edition-record-main">
      <div className={`edition-date-stamp is-${type}`}><span>{date.slice(0,7).replace("-"," / ")}</span><strong>{date.slice(8)}</strong><small>{label}</small></div>
      <div className="edition-record-copy"><h3 id={`title-${date}`}>{date} <span>{label}</span></h3><p>{latest.summary}</p><ul className="edition-record-topics" aria-label="报告主题">{latest.sections.slice(0,4).map((s,i)=><li key={i} className={`topic-${s.tone}`}>{s.title}</li>)}</ul></div>
     </div>
     <div className="edition-record-footer"><span><Icon name="file" size={16}/>PDF 已归档 <span className="edition-record-time">· {new Date(latest.cutoff).toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit"})} 生成</span>{versions.length>1?<span> · {versions.length} 个版本</span>:null}</span><div className="edition-record-actions"><a className="quiet-button" href={`/api/reports/${latest.id}/pdf`}>下载 PDF</a><a className="primary-button" href={`/api/reports/${latest.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer"><Icon name="file" size={16}/>打开源文件<Icon name="arrow" size={14}/></a></div></div>
     {versions.length>1?<details className="edition-record-versions"><summary>历史版本（{versions.length-1}）</summary>{versions.slice(1).map(b=><div key={b.id}><span>{new Date(b.cutoff).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</span><a href={`/api/reports/${b.id}/pdf?view=1`} target="_blank" rel="noopener noreferrer">打开此版本 PDF</a></div>)}</details>:null}
    </article>;
   })}</div>:<div className="edition-empty"><Icon name="file" size={28}/><h3>还没有{type==="daily"?"日报":"周报"}记录</h3><p>生成后，每个日期会在这里保存为一条记录。完整内容收在 PDF 中，随时打开查看。</p></div>}
  </section>
  {legacy?.reports.length?<details className="edition-settings"><summary>早期报告记录</summary>{legacy.reports.map(r=><section key={r.id}><h3>{r.report_date} · {reportLabels[r.report_type as keyof typeof reportLabels]} · v{r.version}</h3><p>{r.summary}</p>{Array.from(groupReportItems(legacy.items.filter(i=>i.report_id===r.id))).map(([key,items])=><ReportSection key={key} section={key} items={items} compact/>)}</section>)}</details>:null}
 </div>;
}
