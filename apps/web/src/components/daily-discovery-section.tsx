import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { candidateMailProgress, type DailySnapshot } from "@/lib/jobs/daily-model";
import { radarTimeLabel, radarSourceTime } from "@/lib/jobs/radar-source-time";
import { DailyDiscoverySettings } from "./daily-discovery-settings";

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
  const progress=candidateMailProgress(candidates?.data??[],mails?.data??[]);
  const timestamp=(value:string)=>new Intl.DateTimeFormat("zh-CN",{timeZone:"Asia/Shanghai",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value));
  return <section className="workspace-section daily-discovery">
    <div className="workspace-section-heading"><div><h2>每日发现</h2><p>每天 09:00 · 二级买方投研 / 二级卖方研究 / 一级 PEVC · AI 精选高质量岗位</p></div><span className="count-chip">{snapshot.settings?.enabled?"自动汇总已开启":"自动汇总未开启"}</span></div>
    {daily?.error?<p role="alert">每日报告读取失败，请稍后刷新。</p>:null}
    <DailyDiscoverySettings settings={snapshot.settings}/>
    <div className="daily-brief-grid"><section><h3>今日推荐</h3>
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
    </section><section><h3>候选岗位进展</h3>
      <p className="daily-meta">最近7天已同步邮件 · 仅匹配已加入候选池的实习岗位</p>
      {connection?.data?.status!=="connected"?<p role="status">Gmail 未连接或已暂停，暂不能获取最新邮件。<Link href="/settings">检查连接</Link></p>:<p className="daily-meta">邮箱最后同步：{connection.data.last_success_at?timestamp(connection.data.last_success_at):"尚无成功记录"}</p>}
      {mails?.error||candidates?.error?<p role="alert">邮件或候选记录读取失败，请稍后刷新。</p>:progress.length?<ul className="daily-progress">{progress.map(({candidate,mail,confirmed})=><li key={`${mail.id}-${candidate.id}`}>
        <strong>{candidate.company} · {candidate.role_title}</strong><p>{mail.summary||mail.subject}</p>
        <p className="daily-meta">{timestamp(mail.received_at)} · {confirmed?"公司与岗位匹配，流程变化待确认":"疑似相关，需核对具体岗位"}</p>
        <Link href={`/inbox?message=${encodeURIComponent(mail.id)}`}>查看邮件</Link>
      </li>)}</ul>:<p>暂无可明确关联的面试或招聘流程更新。</p>}
    </section></div>
  </section>;
}
