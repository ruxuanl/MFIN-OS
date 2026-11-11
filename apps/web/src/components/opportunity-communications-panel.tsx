import { decideCommunicationLinkAction } from "@/app/(app)/inbox/actions";
import { SubmitButton } from "@/components/operation-feedback";
import { linkRuleLabel } from "@/lib/gmail/link-model";
import type { LinkView } from "@/lib/gmail/links";

export function OpportunityCommunicationsPanel({ links, returnTo }: { links: LinkView[]; returnTo: string }) {
  const linked = links.filter((link) => link.status === "linked");
  const suggested = links.filter((link) => link.status === "suggested");
  return (
    <section className="detail-panel">
      <div className="panel-heading"><div><p>Communications</p><h3>相关邮件</h3></div><span className="muted-count">{linked.length}</span></div>
      {linked.length === 0 && suggested.length === 0 ? <p className="workspace-empty small-empty">尚无关联邮件。关联建议会出现在收件箱，需你确认。</p> : null}
      <ul className="communication-list">
        {linked.map((link) => <li key={link.id}>
          <div>
            <strong>{link.message?.subject ?? "邮件已不可用"}</strong>
            <small>{link.message ? new Date(link.message.receivedAt).toLocaleString("zh-CN") : "—"} · {linkRuleLabel(link.matchRule)}</small>
          </div>
          <div className="inbox-item-actions">
            {link.message ? <a className="quiet-link" href={link.message.gmailLink} target="_blank" rel="noreferrer">原邮件 ↗</a> : null}
            <form action={decideCommunicationLinkAction}><input type="hidden" name="linkId" value={link.id}/><input type="hidden" name="returnTo" value={returnTo}/><SubmitButton className="quiet-button" name="decision" value="unlink" pendingLabel="正在撤销…">撤销关联</SubmitButton></form>
          </div>
        </li>)}
      </ul>
      {suggested.length ? <p className="section-note">另有 {suggested.length} 封邮件待确认是否属于本岗位，请到收件箱处理。</p> : null}
    </section>
  );
}
