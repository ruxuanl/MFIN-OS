import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { candidateMailProgress, type DailySnapshot } from "@/lib/jobs/daily-model";
import { radarTimeLabel, radarSourceTime } from "@/lib/jobs/radar-source-time";
import { DailyDiscoverySettings } from "./daily-discovery-settings";
import { getEditorialDaily } from "@/lib/jobs/editorial-daily";
import { DailyEditorialBrief } from "./daily-editorial-brief";

export async function DailyDiscoverySection(){
  const user=await requireUser();
  const client=user.isMock?null:await createClient();
  const cutoff=new Date();cutoff.setDate(cutoff.getDate()-7);
  const [daily,candidates,mails,connection]=await Promise.all([
    client?.rpc("daily_discovery",{target_action:"read"}),
    client?.from("opportunity_candidates").select("id,company,role_title,created_at").eq("user_id",user.id).eq("track","internship").not("decision_status","in","(rejected,ignored)").order("created_at",{ascending:false}).limit(500),
    client?.from("inbox_mail_view").select("id,subject,summary,received_at").eq("user_id",user.id).gte("received_at",cutoff.toISOString()).order("received_at",{ascending:false}).limit(200),
    client?.from("external_connections").select("status,last_success_at").eq("user_id",user.id).eq("provider","gmail").maybeSingle()
  ]);
  const snapshot=(daily?.data as unknown as DailySnapshot)??{settings:null,reports:[]};
  const report=snapshot.reports[0];
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Shanghai"}).format(new Date());
  const editorial=getEditorialDaily(today);
  const progress=candidateMailProgress(candidates?.data??[],mails?.data??[]);
  const timestamp=(value:string)=>new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
  return <section className="workspace-section daily-discovery">
    <div className="daily-masthead"><div><h2>每日发现</h2><p>二级买方投研 / 二级卖方研究 / 一级 PEVC</p></div><div className="daily-edition"><time dateTime={today}>{today.replaceAll("-", ".")}</time><span>{snapshot.settings?.enabled?"每天 09:00 自动汇总":"自动汇总未开启"}</span></div></div>
    {editorial?<div className="daily-lead"><div><h3>把时间留给<br/>值得研究的机会。</h3><p>今日补充版已就绪。先读职责，再看资格，最后决定是否推进。</p><a href="#daily-picks">阅读今日线索 <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M12 4v16m-6-6 6 6 6-6"/></svg></a></div><div className="daily-edition-note"><strong>今日核验</strong><span>{editorial.items.length} 条实习线索</span><span>1 条 PE 资格观察</span><small>核验于 {editorial.day}<br/>来源未披露发布日期</small></div></div>:null}
    {daily?.error?<p role="alert">每日报告读取失败，请稍后刷新。</p>:null}
    <DailyDiscoverySettings settings={snapshot.settings}/>
    <div className="daily-brief-grid"><section id="daily-picks"><h3>{editorial?"今日精选线索":"今日推荐"}</h3>
      {editorial?<DailyEditorialBrief brief={editorial}/>:null}
      <details className="daily-auto-report" open={!editorial}><summary>自动搜索报告{report?` · ${report.report_day}`:""}</summary>
      {!report?<p>{snapshot.settings?.enabled?"等待下一次09:00自动汇总。":"请开启定时汇总。"}</p>:<>
        <p className="daily-meta">报告日期：{report.report_day} · {report.finished_at?timestamp(report.finished_at):timestamp(report.created_at)}{report.report_day!==today?" · 今天尚未生成新报告":""}</p>
        {report.status==="running"?<p role="status">正在自动搜集和评估岗位…</p>:report.status!=="completed"?<p role="alert">本轮未完成（{report.error_code==="budget_exceeded"?"AI预算不足":report.error_code==="provider_not_configured"?"服务尚未配置":report.error_code==="permission_or_settings_changed"?"权限或设置已变更":"来源、AI或权限暂不可用"}）。请查看设置和状态中心；今天不会重复消耗搜索额度。</p>:!report.recommendations.length?<p>本轮没有同时达到匹配和含金量标准的新岗位，今天不凑数。</p>:<ol className="daily-recommendations">{report.recommendations.map(item=><li key={item.url}>
          <h4><a href={item.url} target="_blank" rel="noreferrer">{item.summary||item.title}</a></h4>
          <p className="daily-meta">{radarTimeLabel(radarSourceTime(item)).value} · {item.locationZh||item.location} · 资格{item.assessment.qualification}</p>
          <p><strong>匹配 {item.assessment.match} · 含金量 {item.assessment.quality}</strong>　{item.assessment.reason}</p>
          <p>方向意愿：{item.assessment.preference} · 紧迫度：{item.assessment.urgency}</p>
          <p>缺口与准备：{item.assessment.gaps}</p><p>建议：{item.assessment.nextStep}</p>
          <Link href="/internships?tab=discover">在发现实习中核对并加入候选</Link>
        </li>)}</ol>}
      </>}
      <p className="daily-meta">覆盖公开网络搜索；受索引和来源日期限制。原网页可核对，资格未知会明确提示。</p>
      </details>
    </section><section><h3>候选岗位进展</h3>
      <p className="daily-meta">最近7天已同步邮件 · 仅匹配已加入候选池的实习岗位</p>
      {connection?.data?.status!=="connected"?<p role="status">Gmail 未连接或已暂停，暂不能获取最新邮件。<Link href="/settings">检查连接</Link></p>:<p className="daily-meta">邮箱最后同步：{connection.data.last_success_at?timestamp(connection.data.last_success_at):"尚无成功记录"}</p>}
      {mails?.error||candidates?.error?<p role="alert">邮件或候选记录读取失败，请稍后刷新。</p>:progress.length?<ul className="daily-progress">{progress.map(({candidate,mail,confirmed})=><li key={`${mail.id}-${candidate.id}`}>
        <strong>{candidate.company} · {candidate.role_title}</strong><p>{mail.summary||mail.subject}</p>
        <p className="daily-meta">{timestamp(mail.received_at)} · {confirmed?"公司与岗位匹配，流程变化待确认":"疑似相关，需核对具体岗位"}</p>
        <Link href={`/inbox?message=${encodeURIComponent(mail.id)}`}>查看邮件</Link>
      </li>)}</ul>:<div className="daily-mail-empty"><p>暂无可明确关联的面试或招聘流程更新。</p><Link href="/inbox">查看已同步邮件</Link></div>}
      {editorial?<><section className="daily-side-note"><h3>PE · 资格观察</h3><a href={editorial.watch.url} target="_blank" rel="noreferrer">{editorial.watch.company} · {editorial.watch.title}</a><p>{editorial.watch.note}</p></section><section className="daily-side-note"><h3>今天替你排除</h3><a href={editorial.excluded.url} target="_blank" rel="noreferrer">{editorial.excluded.company}</a><p>{editorial.excluded.note}</p></section><div className="daily-next-action"><h3>读完，做一件事</h3><p>先核对高盛一年的到岗安排；若时间不合适，再检查 Point72 的毕业月份与 GPA 要求。</p><Link href="/internships?tab=discover">打开实习搜索</Link></div></>:null}
    </section></div>
  </section>;
}
