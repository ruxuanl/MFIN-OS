import Link from "next/link";
import { SubmitButton } from "@/components/operation-feedback";
import { deleteGmailAttachmentAction,resolveInboxItemAction,undoGmailUpdateAction,decideCommunicationLinkAction,editMailInsightAction } from "@/app/(app)/inbox/actions";
import type { getMailDetail } from "@/lib/gmail/insight-data";
import { categoryLabels,priorityLabels,mailCategories,mailPriorities } from "@/lib/gmail/insight-model";
import { opportunityHref } from "@/lib/gmail/link-model";
export function MailDetail({ data,returnTo }: { data: NonNullable<Awaited<ReturnType<typeof getMailDetail>>>; returnTo: string }) {
  const { mail,items,attachments,updates,links }=data;
  return <div className="mail-detail-content">
    <span className={`mail-priority is-${mail.priority}`}>{priorityLabels[mail.priority]}</span>
    <h2>{mail.summary}</h2>
    <dl className="mail-metadata"><div><dt>发件人</dt><dd>{mail.sender_summary || "未知发件人"}</dd></div><div><dt>收到时间</dt><dd>{new Date(mail.received_at).toLocaleString("zh-CN",{ timeZone: "Asia/Hong_Kong",hour12: false })}</dd></div><div><dt>原主题</dt><dd>{mail.subject || "无主题"}</dd></div></dl>
    <a href={mail.gmail_link} target="_blank" rel="noreferrer" className="quiet-link">打开 Gmail 原邮件 ↗</a>
    <section className="mail-detail-section"><h3>整理依据</h3><p>{mail.reason || "尚无 AI 摘要，当前按邮件主题与本地规则临时展示。"}</p>
      {mail.summary && mail.analysis_status!=="completed" && mail.reason ? <p className="section-note">本次整理未完成，保留上次结果。</p> : null}
      {mail.deadline ? <p className="section-note">截止：{new Date(mail.deadline).toLocaleString("zh-CN",{ timeZone: "Asia/Hong_Kong",hour12: false })}</p> : null}
      <form action={editMailInsightAction}><input type="hidden" name="messageId" value={mail.id}/><input type="hidden" name="field" value="retry"/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" pendingLabel="正在排队…">重新整理</SubmitButton></form>
    </section>
    <section className="mail-detail-section"><h3>调整分类与评级</h3>
      {(["category","priority"] as const).map(field=><form key={`${field}-${mail[field]}`} action={editMailInsightAction} className="mail-edit-row">
        <input type="hidden" name="messageId" value={mail.id}/><input type="hidden" name="field" value={field}/><input type="hidden" name="returnTo" value={returnTo}/>
        <label><span>{field==="category" ? "类别" : "重要程度"}{mail[`${field}_override`] ? " · 已锁定" : ""}</span><select name="value" defaultValue={mail[field]}>{field==="category" ? mailCategories.map(v=><option key={v} value={v}>{categoryLabels[v]}</option>) : mailPriorities.map(v=><option key={v} value={v}>{priorityLabels[v]}</option>)}</select></label>
        <SubmitButton className="quiet-button" pendingLabel="正在保存…">保存</SubmitButton>
        {mail[`${field}_override`] ? <SubmitButton className="quiet-button" name="reset" value="true" pendingLabel="正在恢复…">恢复自动</SubmitButton> : null}
      </form>)}
    </section>
    {items.some(item=>item.status==="pending") || updates.length ? <section className="mail-detail-section"><h3>邮件行动</h3><div className="mail-detail-actions">
      {items.filter(item=>item.status==="pending").map(item=><form action={resolveInboxItemAction} key={item.id}><input type="hidden" name="itemId" value={item.id}/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" name="resolution" value="accept" pendingLabel="正在接受…">接受</SubmitButton><SubmitButton className="quiet-button" name="resolution" value="dismiss" pendingLabel="正在忽略…">忽略</SubmitButton></form>)}
      {updates.map(update=><form action={undoGmailUpdateAction} key={update.id}><input type="hidden" name="updateId" value={update.id}/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" pendingLabel="正在撤销…">撤销自动更新</SubmitButton></form>)}
    </div></section> : null}
    {links.length ? <section className="mail-detail-section"><h3>关联岗位</h3>{links.map(link=><div key={link.id} className="mail-detail-section">
      {link.opportunity ? <Link className="quiet-link" href={opportunityHref(link.opportunity.track,link.opportunity.id)}>{link.opportunity.company} · {link.opportunity.role_title}</Link> : <span>岗位已不可用</span>}
      <form action={decideCommunicationLinkAction}><input type="hidden" name="linkId" value={link.id}/><input type="hidden" name="returnTo" value={returnTo}/>{link.status==="suggested" ? <><SubmitButton name="decision" value="confirm" className="quiet-button" pendingLabel="正在关联…">确认关联</SubmitButton><SubmitButton name="decision" value="reject" className="quiet-button" pendingLabel="正在处理…">不是这个岗位</SubmitButton></> : <SubmitButton name="decision" value="unlink" className="quiet-button" pendingLabel="正在撤销…">撤销关联</SubmitButton>}</form>
    </div>)}</section> : null}
    {attachments.length ? <section className="mail-detail-section"><h3>附件</h3>{attachments.map(a=><div className="mail-attachment-row" key={a.id}><span>{a.filename}<small>{a.import_status==="imported" ? "已导入私有存储" : a.import_status==="deleted" ? "副本已删除" : "在 Gmail 查看"}</small></span>{a.import_status==="imported" ? <form action={deleteGmailAttachmentAction}><input type="hidden" name="attachmentId" value={a.id}/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" pendingLabel="正在删除…">删除副本</SubmitButton></form> : null}</div>)}</section> : null}
  </div>;
}
