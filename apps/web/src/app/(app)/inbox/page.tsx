import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { OperationLink, SubmitButton } from "@/components/operation-feedback";
import { ReauthenticateControl } from "@/components/reauthenticate-control";
import { requireUser } from "@/lib/auth/session";
import { isGmailServerConfigured } from "@/lib/config";
import { getInboxData } from "@/lib/gmail/data";
import { linkRuleLabel, opportunityHref } from "@/lib/gmail/link-model";
import { getLinkSuggestions } from "@/lib/gmail/links";
import { displayableGmailErrorCode } from "@/lib/gmail/errors";

import {
  deleteGmailAttachmentAction,
  disconnectGmailAction,
  resolveInboxItemAction,
  decideCommunicationLinkAction,
  setGmailConnectionState,
  triggerGmailSync,
  undoGmailUpdateAction
} from "./actions";

export const metadata = { title: "收件箱" };

const notices: Record<string, string> = {
  link_confirmed: "已确认关联；岗位时间线已记录，阶段没有被修改。",
  link_rejected: "已标记为不相关，这封邮件不会再建议关联到该岗位。",
  link_unlinked: "已撤销关联并写入审计。",
  link_privacy_locked: "隐私锁已开启，关联未被修改。",
  link_failed: "关联操作失败，请刷新后重试。",
  invalid_file_import: "文件导入字段无效；请选择支持的文件并补全公司与岗位。",
  file_empty: "文件为空，未创建任何记录。",
  file_too_large: "文件超过 5 MB；原文件未保存。",
  file_unsupported_type: "仅支持 PDF、DOCX 与 XLSX 文件；原文件未保存。",
  file_type_mismatch: "文件声明类型与实际内容不一致，已按伪装文件拒绝。",
  file_encrypted: "暂不处理加密文档；原文件未保存。",
  file_too_complex: "文档页数、工作表或解压内容超出安全上限；原文件未保存。",
  file_no_jd_text: "未识别到足够的招聘/JD 文本信号，未创建记录。",
  file_ocr_unavailable: "文档没有可检索文字；当前不对扫描版或纯图片 PDF 声称已完成 OCR。",
  file_extract_failed: "文档文本提取失败；原文件未保存，也未创建记录。",
  file_permission_required: "请先开启微信一键导入与文件上传权限。",
  file_import_failed: "文件已在请求内丢弃，但最小岗位投影未写入；未把失败伪装成成功。",
  file_import_duplicate: "相同文件内容与岗位字段已经导入，没有创建重复记录。",
  file_import_pending: "文件文本已在请求内提取并丢弃原件；最小岗位投影已进入待确认。",
  not_configured: "Production Gmail OAuth 尚未配置；当前不会读取任何邮箱。",
  connection_permission_required: "请先在状态中心开启 Gmail 连接与同步权限。",
  reauth_required: "连接或断开 Gmail 前需要新的 Passkey / Face ID 或重新登录证明。",
  oauth_cancelled: "Gmail 授权已取消，未保存凭据。",
  oauth_state_invalid: "OAuth 状态校验失败，未保存凭据。",
  connection_failed: "Gmail 连接失败；没有把失败伪装为已连接。",
  connected: "Production Gmail 已以只读权限连接。",
  sync_partial: "本批次进度已保存；下次同步会继续，尚未宣称全部同步完成。",
  backfill_confirmation_required: "已达到原先 50 封的历史同步范围。更多历史邮件尚未处理，须先确认补同步范围。",
  synced: "Gmail 增量同步已完成；规则不确定的内容已进入待确认。",
  sync_failed: "同步未完成；已保留不含邮件内容的安全错误码供诊断。",
  paused: "Gmail 已暂停；不会读取新邮件，历史记录保留。",
  resumed: "Gmail 已恢复；不会静默补跑历史，请手动同步。",
  connection_state_failed: "连接状态未更新。",
  disconnected: "Gmail 已断开，Google 授权已撤销，Vault 凭据已删除。",
  disconnected_revoke_failed: "本地连接和 Vault 凭据已删除；Google 远端撤销未确认，请在账号中复核。",
  disconnect_failed: "断开失败；连接状态保持可见。",
  resolved: "待确认项目已按你的选择处理。",
  resolve_failed: "待确认项目未处理，原状态保持不变。",
  undone: "Gmail 自动状态更新已撤销，并保留完整历史。",
  undo_failed: "撤销失败，未把结果伪装为成功。",
  attachment_deleted: "导入的附件副本已立即删除；Gmail 原件未改变。",
  attachment_delete_failed: "附件副本未删除，请检查状态后重试。",
  invalid: "请求无效，未执行变更。",
  manual_import_unavailable: "演示模式不写入数据；请登录隔离测试账号后使用手动导入。",
  wechat_import_permission_required: "请先在状态中心开启微信本地净化与微信一键导入权限。",
  privacy_locked: "隐私锁已开启；手动导入被安全拒绝。",
  invalid_manual_import: "手动导入字段无效；链接必须使用 HTTPS，证据片段最长 1000 字。",
  manual_import_failed: "微信手动导入未完成，未把失败伪装为成功。",
  manual_import_duplicate: "相同的文字或链接投影已经导入，没有创建重复候选。",
  manual_import_candidate: "手动导入已完成；你核对过的岗位已进入候选池。",
  manual_import_pending: "手动导入已完成；未核对的岗位已进入待确认。",
  invalid_screenshot: "请选择一张 PNG、JPEG 或 WebP 截图。",
  screenshot_empty: "截图为空，未记录导入。",
  screenshot_too_large: "截图超过 5 MB；原图未保存。",
  screenshot_unsupported_type: "截图字节不是受支持的 PNG、JPEG 或 WebP；原图未保存。",
  screenshot_type_mismatch: "文件声明类型与实际内容不一致；已按伪装文件拒绝。",
  screenshot_permission_required: "请先开启微信一键导入、本地净化与文件上传权限。",
  screenshot_discard_failed: "临时原图未能确认删除，未记录成功；请稍后重试。",
  screenshot_record_failed: "原图已删除，但最小导入记录未写入；未把失败伪装为成功。",
  screenshot_recorded: "截图已完成类型与哈希检查；原图已立即删除。当前无 OCR，请用文字表单补充岗位字段。",
  screenshot_duplicate: "相同截图已检查过；原图仍已立即删除，没有创建重复记录。"
};

const statusLabels: Record<string, string> = {
  connected: "已连接", paused: "已暂停", disconnected: "已断开", connecting: "连接中", error: "异常"
};

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const [data, suggestions] = await Promise.all([getInboxData(user), getLinkSuggestions(user)]);
  const { notice } = await searchParams;
  const configured = isGmailServerConfigured();
  const connectionStatus = data.connection?.status ?? "disconnected";
  const gmailErrorCode = displayableGmailErrorCode(data.connection?.lastErrorCode);
  const messageById = new Map(data.messages.map((message) => [message.id, message]));
  const attachmentsByMessage = new Map<string, typeof data.attachments>();
  for (const attachment of data.attachments) {
    attachmentsByMessage.set(attachment.gmail_message_id, [...(attachmentsByMessage.get(attachment.gmail_message_id) ?? []), attachment]);
  }
  const updateByItem = new Map(data.updates.map((update) => [update.inbox_item_id, update]));
  const projectionById = new Map(data.wechatProjections.map((projection) => [projection.id, projection]));

  return (
    <div className="page-shell inbox-page">
      <PageHeader
        eyebrow="Read-only Inbox"
        title="统一收件箱"
        description="Gmail 是唯一邮件入口，规则提取与待确认保留来源和历史。"
        action={<span className={`status-pill${connectionStatus === "connected" ? " is-ready" : ""}`}>{statusLabels[connectionStatus] ?? connectionStatus}</span>}
      />
      {notice && notices[notice] ? <p className="status-notice" role="status">{notices[notice]}</p> : null}
      {notice === "sync_failed" && gmailErrorCode
        ? <p className="status-notice" role="status">错误码：<code>{gmailErrorCode}</code></p>
        : null}

      <section className="calendar-connection-card inbox-connection-card">
        <div>
          <p className="page-eyebrow">Independent OAuth</p>
          <h2>Gmail 只读连接</h2>
          <p>范围固定为 <code>gmail.readonly</code>。不发送、不回复、不归档、不删除、不加标签、不改变已读状态。</p>
        </div>
        <div className="calendar-connection-actions">
          {connectionStatus === "connected" ? <>
            <form action={triggerGmailSync}><SubmitButton className="primary-button" pendingLabel="正在同步…">立即同步</SubmitButton></form>
            <form action={setGmailConnectionState}><SubmitButton className="quiet-button" name="status" value="paused" pendingLabel="正在暂停…">暂停连接</SubmitButton></form>
            <ReauthenticateControl returnTo="/inbox" />
            <form action={disconnectGmailAction}><SubmitButton className="danger-button" pendingLabel="正在断开…">断开并撤销</SubmitButton></form>
          </> : connectionStatus === "paused" ?
            <form action={setGmailConnectionState}><SubmitButton className="primary-button" name="status" value="connected" pendingLabel="正在恢复…">恢复连接</SubmitButton></form> : <>
              <ReauthenticateControl returnTo="/inbox" />
              <OperationLink className={`primary-button${!configured || data.isMock ? " is-disabled" : ""}`} disabled={!configured || data.isMock} href="/api/gmail/oauth/start" pendingLabel="正在连接…">连接 Gmail</OperationLink>
              <Link className="quiet-link" href="/status">检查 Gmail 权限 →</Link>
            </>}
        </div>
      </section>

      <div className="calendar-metrics">
        <article><span>收件项目</span><strong>{data.items.length}</strong><small>含微信 {data.items.filter((item) => item.wechat_projection_id).length} 项</small></article>
        <article><span>待确认</span><strong>{data.items.filter((item) => item.status === "pending").length}</strong><small>低置信度不静默猜测</small></article>
        <article><span>已自动更新</span><strong>{data.updates.length}</strong><small>明确面试且唯一匹配</small></article>
        <article><span>已导入附件</span><strong>{data.attachments.filter((item) => item.import_status === "imported").length}</strong><small>可立即删除副本</small></article>
      </div>

      <section className="calendar-section">
        <div className="section-heading"><p>Inbox</p><h2>邮件行动与待确认</h2></div>
        <div className="inbox-list">
          {data.items.map((item) => {
            const message = item.gmail_message_id ? messageById.get(item.gmail_message_id) : undefined;
            const itemAttachments = item.gmail_message_id
              ? (attachmentsByMessage.get(item.gmail_message_id) ?? [])
              : [];
            const update = updateByItem.get(item.id);
            const projection = item.wechat_projection_id ? projectionById.get(item.wechat_projection_id) : undefined;
            return <article key={item.id}>
              <div className="inbox-item-head">
                <div><strong>{item.title}</strong><p>{item.summary}</p></div>
                <span className={`status-pill${item.status === "auto_applied" || item.status === "accepted" ? " is-ready" : ""}`}>{item.status === "pending" && !item.wechat_projection_id ? "待确认" : item.status === "auto_applied" ? "已自动更新" : item.status === "accepted" ? "已接受" : "已忽略"}</span>
              </div>
              <small>{item.classification} · 置信度 {Math.round(item.confidence * 100)}% · {projection?.rule_version ?? (item.wechat_projection_id ? "wechat_rules_v1" : "mail_rules_v1")} · 非 AI</small>
              <div className="inbox-item-actions">
                {message ? <a className="quiet-link" href={message.gmail_link} target="_blank" rel="noreferrer">打开 Gmail 原邮件 ↗</a> : null}
                {projection?.source_url ? <a className="quiet-link" href={projection.source_url} target="_blank" rel="noreferrer">打开用户提交的来源 ↗</a> : null}
                {item.status === "pending" ? <>
                  <form action={resolveInboxItemAction}><input type="hidden" name="itemId" value={item.id}/><SubmitButton className="primary-button" name="resolution" value="accept" pendingLabel="正在接受…">接受</SubmitButton></form>
                  <form action={resolveInboxItemAction}><input type="hidden" name="itemId" value={item.id}/><SubmitButton className="quiet-button" name="resolution" value="dismiss" pendingLabel="正在忽略…">忽略</SubmitButton></form>
                </> : null}
                {update ? <form action={undoGmailUpdateAction}><input type="hidden" name="updateId" value={update.id}/><SubmitButton className="quiet-button" pendingLabel="正在撤销…">撤销自动更新</SubmitButton></form> : null}
              </div>
              {itemAttachments.map((attachment) => <div className="inbox-attachment" key={attachment.id}>
                <span>{attachment.filename} · {attachment.import_status === "imported" ? "已导入私有存储" : attachment.import_status === "deleted" ? "副本已删除" : "仅 Gmail 原链接"}</span>
                {attachment.import_status === "imported" ? <form action={deleteGmailAttachmentAction}><input type="hidden" name="attachmentId" value={attachment.id}/><SubmitButton className="quiet-button" pendingLabel="正在删除…">立即删除副本</SubmitButton></form> : null}
              </div>)}
            </article>;
          })}
          {data.items.length === 0 ? <p className="workspace-empty small-empty">尚无收件项目。可手动导入微信文字/链接，或连接 Gmail 后同步。</p> : null}
        </div>
      </section>
      <section className="calendar-section">
        <div className="section-heading"><p>Link suggestions</p><h2>邮件与岗位关联建议</h2></div>
        <p className="section-note">只有发件域名、公司名或岗位名唯一匹配一个岗位时才会出现建议（mail_link_rules_v1，非 AI）。确认后写入岗位时间线，不会修改岗位阶段。</p>
        <div className="inbox-list">
          {suggestions.map((link) => <article key={link.id}>
            <div className="inbox-item-head">
              <div>
                <strong>{link.message?.subject ?? "邮件已不可用"}</strong>
                <p>建议关联到 {link.opportunity ? <Link className="quiet-link" href={opportunityHref(link.opportunity.track, link.opportunity.id)}>{link.opportunity.company} · {link.opportunity.roleTitle}</Link> : "已删除的岗位"}</p>
              </div>
              <span className="status-pill">待确认</span>
            </div>
            <small>{linkRuleLabel(link.matchRule)} · {link.matchEvidence}{link.message ? ` · ${new Date(link.message.receivedAt).toLocaleString("zh-CN")}` : ""}</small>
            <div className="inbox-item-actions">
              {link.message ? <a className="quiet-link" href={link.message.gmailLink} target="_blank" rel="noreferrer">打开 Gmail 原邮件 ↗</a> : null}
              <form action={decideCommunicationLinkAction}><input type="hidden" name="linkId" value={link.id}/><input type="hidden" name="returnTo" value="/inbox"/><SubmitButton className="primary-button" name="decision" value="confirm" pendingLabel="正在关联…">确认关联</SubmitButton></form>
              <form action={decideCommunicationLinkAction}><input type="hidden" name="linkId" value={link.id}/><input type="hidden" name="returnTo" value="/inbox"/><SubmitButton className="quiet-button" name="decision" value="reject" pendingLabel="正在处理…">不是这个岗位</SubmitButton></form>
            </div>
          </article>)}
          {suggestions.length === 0 ? <p className="workspace-empty small-empty">暂无待确认的关联建议。</p> : null}
        </div>
      </section>
      <p className="forbidden-note">永久禁止：本产品不会发送微信消息，也不会读取非白名单聊天；没有 Gmail 发送、回复、转发、归档、删除、标签或已读状态写入能力。</p>
    </div>
  );
}
