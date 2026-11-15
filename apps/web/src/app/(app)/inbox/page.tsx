import Link from "next/link";
import { createHash } from "node:crypto";
import "./inbox-view.css";
import { Icon } from "@/components/icon";
import { MailMessageList } from "@/components/mail-message-list";
import { PageHeader } from "@/components/page-header";
import { OperationLink, SubmitButton } from "@/components/operation-feedback";
import { ReauthenticateControl } from "@/components/reauthenticate-control";
import { MailDetailDialog } from "@/components/mail-detail-dialog";
import { MailDetail } from "@/components/mail-detail";
import { MailAnalysisProgress } from "@/components/mail-analysis-progress";
import { requireUser } from "@/lib/auth/session";
import { isGmailServerConfigured } from "@/lib/config";
import { getMailbox,getMailboxConnection,getMailDetail } from "@/lib/gmail/insight-data";
import { categoryLabels,priorityLabels,mailCategories,mailPriorities,isMailCategory,isMailPriority,inboxHref } from "@/lib/gmail/insight-model";
import { disconnectGmailAction,setGmailConnectionState,triggerGmailSync } from "./actions";
import { notices } from "./notices";
export const metadata={ title: "收件箱" };
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ category?: string; priority?: string; page?: string; message?: string; notice?: string }> }) {
  const user=await requireUser();
  const params=await searchParams;
  const category=isMailCategory(params.category) ? params.category : undefined;
  const priority=isMailPriority(params.priority) ? params.priority : undefined;
  const page=Math.max(1,Math.min(100000,Number.parseInt(params.page ?? "1",10)||1));
  const [data,connection,detail]=await Promise.all([getMailbox(user,category,priority,page),getMailboxConnection(user),params.message ? getMailDetail(user,params.message) : Promise.resolve(null)]);
  const listVersion = createHash("sha256").update(JSON.stringify([data.messages,data.counts,data.total])).digest("hex");
  const back=inboxHref(category,priority,page);
  const configured=isGmailServerConfigured() && !user.isMock;
  const status=connection?.status ?? "disconnected";
  const count=(c: string,p?: string)=>data.counts.filter(x=>x.category===c && (!p || x.priority===p)).reduce((sum,x)=>sum+Number(x.count),0);
  return <div className="page-shell mail-page">
    <PageHeader eyebrow="INBOX" title={category ? categoryLabels[category] : "收件箱"} action={<details className="mail-tools"><summary aria-label="邮件工具"><Icon name="more"/></summary><div className="mail-tool-panel">
      <strong>邮件工具</strong><p>{status==="connected" ? "Gmail 已连接" : status==="paused" ? "Gmail 已暂停" : "Gmail 未连接"}</p>
      {connection?.last_success_at ? <small>上次同步 {new Date(connection.last_success_at).toLocaleString("zh-CN",{timeZone:"Asia/Hong_Kong",hour12:false})}</small> : null}
      {status==="connected" ? <><form action={triggerGmailSync}><SubmitButton className="quiet-button" pendingLabel="正在同步…">立即同步</SubmitButton></form><form action={setGmailConnectionState}><SubmitButton className="quiet-button" name="status" value="paused" pendingLabel="正在暂停…">暂停连接</SubmitButton></form></> : status==="paused" ? <form action={setGmailConnectionState}><SubmitButton className="quiet-button" name="status" value="connected" pendingLabel="正在恢复…">恢复连接</SubmitButton></form> : <><ReauthenticateControl returnTo="/inbox"/><OperationLink className="quiet-link" disabled={!configured} href="/api/gmail/oauth/start" pendingLabel="正在连接…">连接 Gmail</OperationLink></>}
      {status==="connected" || status==="paused" ? <form action={disconnectGmailAction}><SubmitButton className="quiet-button" pendingLabel="正在断开…">断开连接</SubmitButton></form> : null}
      <Link className="quiet-link" href="/status">权限与运行状态</Link><Link className="quiet-link" href="/inbox/history">历史导入记录</Link>
      <small>{data.unfinished ? data.unfinished+" 封尚未完成 AI 整理" : "邮件已整理"}</small>
    </div></details>}/>
    {data.unfinished ? <p className="mail-notice"><MailAnalysisProgress queued={data.queued} unfinished={data.unfinished}/></p> : null}
    {params.notice ? <p className="mail-notice" role="status">{notices[params.notice] ?? (params.notice==="mail_saved" ? "已保存，手动调整不会被自动覆盖。" : params.notice==="mail_queued" ? "已加入整理队列。" : "操作未完成，请检查权限后重试。")}</p> : connection?.last_error_code ? <p className="mail-notice" role="status">邮件同步暂不可用，可在邮件工具中检查连接。</p> : null}
    <div className="mail-desktop">
    {!category ? <section className="mail-overview" aria-label="邮件分类">
      {mailCategories.map(c => <article key={c} className={"mail-overview-group category-" + c}>
        <Link className="mail-overview-heading" href={inboxHref(c)}>
          <span className="mail-overview-name"><Icon name={c === "job" ? "briefcase" : c === "academic" ? "book" : "inbox"}/><h2>{categoryLabels[c]}</h2></span>
          <span className="mail-overview-total"><strong>{count(c)}</strong><small>封</small><Icon name="arrow" size={16}/></span>
        </Link>
        <div className="mail-overview-levels">{mailPriorities.map(p => <Link key={p} href={inboxHref(c,p)} className={"is-" + p}><span>{priorityLabels[p]}</span><strong>{count(c,p)}</strong></Link>)}</div>
      </article>)}
    </section> : <nav className="mail-category-nav" aria-label="邮件类别"><Link href="/inbox">全部邮件</Link>{mailCategories.map(c => <Link href={inboxHref(c)} key={c} aria-current={c === category ? "page" : undefined}>{categoryLabels[c]}</Link>)}</nav>}
    <section className="mail-list-section mail-browser" aria-labelledby="mail-browser-title">
      <header className="mail-browser-heading"><div><h2 id="mail-browser-title">{category ? categoryLabels[category] + "邮件" : "全部邮件"}<span className="mail-total">{data.total} 封</span></h2><p>按收到时间排序，向下滚动浏览</p></div>
        <nav className="mail-segments" aria-label="重要程度筛选">{([undefined,...mailPriorities]).map(p => <Link key={p ?? "all"} href={inboxHref(category,p)} scroll={false} aria-current={p === priority ? "page" : undefined}>{p ? priorityLabels[p] : "全部"}</Link>)}</nav>
      </header>
      <MailMessageList key={[category ?? "all",priority ?? "all",page,listVersion].join(":")} initialMessages={data.messages} total={data.total} category={category} priority={priority} initialPage={page}/>
    </section>
    </div>
    <div className="mail-legacy-phone">
    {!category ? <section className="mail-category-grid" aria-label="邮件分类">{mailCategories.map((c,index)=><article key={c} className={"mail-category-card category-"+c}>
      <Link className="mail-category-link" href={inboxHref(c)}><span className="mail-category-icon" aria-hidden="true">{["↗","▤","⋯"][index]}</span><h2>{categoryLabels[c]}</h2><span className="mail-category-total">{count(c)} 封<span aria-hidden="true"> ›</span></span></Link>
      <div className="mail-count-grid">{mailPriorities.map(p=><Link key={p} href={inboxHref(c,p)} className={"mail-count is-"+p}><span>{priorityLabels[p]}</span><strong>{count(c,p)}<small> 封</small></strong></Link>)}</div>
    </article>)}</section> : <>
      <nav className="mail-category-nav" aria-label="邮件类别"><Link href="/inbox">‹ 收件箱</Link>{mailCategories.map(c=><Link href={inboxHref(c)} key={c} aria-current={c===category ? "page" : undefined}>{categoryLabels[c]}</Link>)}</nav>
      <section className="mail-list-section" aria-label={categoryLabels[category]+"邮件"}>
        <div className="mail-list-toolbar"><nav className="mail-segments" aria-label="重要程度筛选">{([undefined,...mailPriorities]).map(p=><Link key={p ?? "all"} href={inboxHref(category,p)} aria-current={p===priority ? "page" : undefined}>{p ? priorityLabels[p] : "全部"}</Link>)}</nav><span className="mail-total">{data.total} 封</span></div>
        <div className="mail-message-list">{data.messages.map(mail=><Link key={mail.id} href={inboxHref(category,priority,page,mail.id)} scroll={false} className="mail-message-row">
          <span className="mail-message-summary">{mail.summary || "无主题邮件"}</span><span className="mail-message-sender">{mail.sender_summary || "未知发件人"}</span>
          <time dateTime={mail.received_at}>{new Date(mail.received_at).toLocaleString("zh-CN",{timeZone:"Asia/Hong_Kong",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false})}</time><span className={"mail-priority is-"+mail.priority}>{priorityLabels[mail.priority]}</span>
        </Link>)}{!data.messages.length ? <p className="mail-empty">这里暂时没有邮件</p> : null}</div>
        {data.total>30 ? <nav className="mail-pagination" aria-label="邮件分页">{page>1 ? <Link href={inboxHref(category,priority,page-1)}>上一页</Link> : <span/>}<span>{page} / {Math.max(1,Math.ceil(data.total/30))}</span>{page*30<data.total ? <Link href={inboxHref(category,priority,page+1)}>下一页</Link> : <span/>}</nav> : null}
      </section>
    </>}
    </div>
    {detail ? <MailDetailDialog key={detail.mail.id} closeHref={back}><MailDetail data={detail} returnTo={inboxHref(category,priority,page,detail.mail.id)}/></MailDetailDialog> : params.message ? <p className="mail-notice" role="status">邮件已不可用。<Link href={back}>返回列表</Link></p> : null}
  </div>;
}
