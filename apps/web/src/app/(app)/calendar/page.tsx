import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { OperationLink, SubmitButton } from "@/components/operation-feedback";
import { ReauthenticateControl } from "@/components/reauthenticate-control";
import { createAction } from "@/app/(app)/workspace-actions";
import { requireUser } from "@/lib/auth/session";
import { calendarLabels, PRODUCT_CALENDAR_NAME, PRODUCT_CALENDAR_TIME_ZONE } from "@/lib/calendar/constants";
import { getCalendarCenterData } from "@/lib/calendar/data";
import { formatCalendarDateTimeLocal } from "@/lib/calendar/model";
import { isCalendarServerConfigured } from "@/lib/config";

import {
  disconnectCalendarAction,
  queueCalendarAction,
  resolveCalendarConflictAction,
  setCalendarConnectionState,
  triggerCalendarSync,
  updatePersonalCalendarAction
} from "./actions";
import { CalendarSyncSubmitButton } from "./sync-submit-button";

export const metadata = { title: "日历同步" };

const notices: Record<string, string> = {
  not_configured: "M4 服务端密钥尚未配置；当前不会启动外部授权。",
  connection_permission_required: "请先在状态中心开启 Calendar 连接权限。",
  reauth_required: "连接或断开 Calendar 前需要新的 Passkey / Face ID 或重新登录证明。",
  oauth_cancelled: "Google Calendar 授权已取消，未保存凭据。",
  oauth_state_invalid: "OAuth 状态校验失败，未保存凭据，请重新开始。",
  connection_failed: "Calendar 连接或初始化失败；没有把失败伪装为已连接。",
  connected: "隔离 Calendar 已连接，产品日历与四类标签已初始化。",
  invalid: "请求无效，未执行任何变更。",
  schedule_required: "请先为行动填写日期或开始时间。",
  queue_failed: "未能加入同步队列；隐私锁或数据约束可能仍在生效。",
  queued: "事项已进入持久化同步队列；权限关闭时会保持待同步。",
  sync_failed: "同步失败，错误状态已保留，可在修复连接后重试。",
  synced: "Calendar 增量同步与待处理写入已完成。",
  sync_pending: "Calendar 读取同步已完成；仍有写入任务因权限、连接或重试条件未满足而保留待同步。",
  sync_conflicts: "Calendar 同步已完成，但存在需要你选择处理方式的冲突。",
  paused: "Calendar 已暂停；令牌保留，但不会读取或写入。",
  resumed: "Calendar 已恢复；历史不会自动补跑，请主动同步。",
  connection_state_failed: "连接状态未更新。",
  disconnected: "Calendar 已断开，Google 授权已撤销，Vault 凭据已删除。",
  disconnected_revoke_failed: "本地连接和 Vault 凭据已删除；Google 远端撤销未确认，请在 Google 账号中复核。",
  disconnect_failed: "断开失败；连接状态保持可见，请重新验证后重试。",
  conflict_failed: "冲突未解决；远端和产品状态均未被静默覆盖。",
  conflict_resolved: "冲突已按你的选择处理，并追加时间线与审计。",
  action_created: "个人行动已创建；它尚未写入 Calendar，请选择时间事件或全天事件。",
  action_failed: "个人行动创建失败，请检查标题和时间。",
  action_updated: "个人行动已更新；Google Calendar 尚未改动，请点击“立即同步”完成外部更新。",
  action_unchanged: "没有检测到字段变化；Google Calendar 未执行更新。",
  action_update_failed: "个人行动更新失败；原记录和 Calendar 事件均未被改动。",
  action_update_conflict: "个人行动的并发修改已进入冲突队列；没有静默覆盖另一端的新值。"
};

const statusLabels: Record<string, string> = {
  connected: "已连接",
  paused: "已暂停",
  disconnected: "已断开",
  connecting: "连接中",
  error: "异常"
};

const resolutionOptions: Record<string, Array<{ value: string; label: string }>> = {
  remote_deleted: [
    { value: "cancel_schedule", label: "取消排期" },
    { value: "resync", label: "重新同步" }
  ],
  concurrent_change: [
    { value: "accept_calendar", label: "采用 Calendar 时间" },
    { value: "use_product", label: "采用产品排期" }
  ],
  write_protected: [{ value: "keep_read_only", label: "保持只读" }]
};

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: PRODUCT_CALENDAR_TIME_ZONE
});

export default async function CalendarPage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const data = await getCalendarCenterData(user);
  const { notice } = await searchParams;
  const configured = isCalendarServerConfigured();
  const connectionStatus = data.connection?.status ?? "disconnected";
  const linkByAction = new Map(data.links.map((link) => [link.action_id, link]));
  const sourceById = new Map(data.sources.map((source) => [source.id, source]));

  return (
    <div className="page-shell calendar-page">
      <PageHeader
        eyebrow="M4 · Calendar loop"
        title="日历同步"
        description="Google Calendar 负责每日时间与提醒；Action 和三张长期表仍以产品数据库为真相源。外部既有事件只读。"
        action={<span className={`status-pill${connectionStatus === "connected" ? " is-ready" : ""}`}>{statusLabels[connectionStatus] ?? connectionStatus}</span>}
      />

      {notice && notices[notice] ? <p className="status-notice" role="status">{notices[notice]}</p> : null}

      <section className="calendar-connection-card">
        <div>
          <p className="page-eyebrow">Independent OAuth</p>
          <h2>{PRODUCT_CALENDAR_NAME}</h2>
          <p>时区 {PRODUCT_CALENDAR_TIME_ZONE}。读取测试账号日历用于冲突判断，只写本产品创建的独立日历。</p>
          <div className="calendar-labels">
            {Object.entries(calendarLabels).map(([key, label]) => (
              <span key={key} style={{ "--label-color": label.backgroundColor } as React.CSSProperties}>{label.name}</span>
            ))}
          </div>
        </div>
        <div className="calendar-connection-actions">
          {connectionStatus === "connected" ? (
            <>
              <form action={triggerCalendarSync} className="calendar-sync-form">
                <CalendarSyncSubmitButton />
              </form>
              <form action={setCalendarConnectionState}><SubmitButton className="quiet-button" name="status" value="paused" pendingLabel="正在暂停…">暂停连接</SubmitButton></form>
              <ReauthenticateControl />
              <form action={disconnectCalendarAction}><SubmitButton className="danger-button" pendingLabel="正在断开…">断开并撤销</SubmitButton></form>
            </>
          ) : connectionStatus === "paused" ? (
            <form action={setCalendarConnectionState}><SubmitButton className="primary-button" name="status" value="connected" pendingLabel="正在恢复…">恢复连接</SubmitButton></form>
          ) : (
            <>
              <ReauthenticateControl />
              <OperationLink className={`primary-button${!configured || data.isMock ? " is-disabled" : ""}`} disabled={!configured || data.isMock} href="/api/calendar/oauth/start" pendingLabel="正在连接…">连接测试 Calendar</OperationLink>
              <Link className="quiet-link" href="/status">检查 Calendar 连接权限 →</Link>
            </>
          )}
        </div>
      </section>

      <div className="calendar-metrics">
        <article><span>日历来源</span><strong>{data.sources.length}</strong><small>全部只读，产品日历除外</small></article>
        <article><span>事件镜像</span><strong>{data.events.length}</strong><small>当前页面最多显示 50 条</small></article>
        <article><span>待同步</span><strong>{data.operations.filter((item) => item.status === "pending").length}</strong><small>关闭权限时保留，不外写</small></article>
        <article><span>冲突</span><strong>{data.conflicts.length}</strong><small>必须由你显式处理</small></article>
      </div>

      {data.conflicts.length ? (
        <section className="calendar-section calendar-conflicts">
          <div className="section-heading"><p>Conflict queue</p><h2>需要你决定</h2></div>
          <div className="calendar-conflict-list">
            {data.conflicts.map((conflict) => (
              <article key={conflict.id}>
                <div><strong>{conflict.conflict_type === "remote_deleted" ? "Calendar 事件已被删除" : conflict.conflict_type === "concurrent_change" ? "产品与 Calendar 同时修改" : "外部事件受只读保护"}</strong><p>系统没有自动重建、覆盖或删除 Action 历史。</p></div>
                <div className="calendar-conflict-actions">
                  {(resolutionOptions[conflict.conflict_type] ?? []).map((option, index) => (
                    <form action={resolveCalendarConflictAction} key={option.value}>
                      <input type="hidden" name="conflictId" value={conflict.id} />
                      <SubmitButton className={index === 0 ? "primary-button" : "quiet-button"} name="resolution" value={option.value}>{option.label}</SubmitButton>
                    </form>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="calendar-section">
        <div className="section-heading"><p>Action scheduling</p><h2>行动与排期</h2></div>
        <p className="section-note">有时间的事项写为时间事件；选择全天时使用截止日期。完成或取消后事件保留，只改变标题。</p>
        <details className="create-drawer">
          <summary>＋ 新建个人行动</summary>
          <form action={createAction} className="workspace-form compact-form">
            <input type="hidden" name="returnTo" value="/calendar" />
            <input type="hidden" name="contextType" value="personal" />
            <input type="hidden" name="track" value="personal" />
            <div className="field-grid">
              <label className="field-wide"><span>可执行描述 *</span><input name="title" required maxLength={300} /></label>
              <label><span>截止时间</span><input name="dueAt" type="datetime-local" /></label>
              <label><span>建议开始</span><input name="suggestedStartAt" type="datetime-local" /></label>
              <label><span>预计分钟</span><input name="estimatedMinutes" type="number" min={1} max={10080} /></label>
              <label><span>优先级</span><select name="priority" defaultValue="normal"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="critical">关键</option></select></label>
              <label className="field-wide"><span>完成标准</span><textarea name="completionCriteria" rows={2} maxLength={1000} /></label>
            </div>
            <SubmitButton className="primary-button" pendingLabel="正在创建…">创建个人行动</SubmitButton>
          </form>
        </details>
        {data.actions.length === 0 ? <p className="workspace-empty small-empty">尚无可排期 Action。</p> : (
          <div className="calendar-action-list">
            {data.actions.map((action) => {
              const link = linkByAction.get(action.id);
              return (
                <article key={action.id}>
                  <div><strong>{action.title}</strong><p>{action.suggested_start_at ? `开始 ${dateTime.format(new Date(action.suggested_start_at))}` : action.due_at ? `截止 ${dateTime.format(new Date(action.due_at))}` : "尚未设置日期"}</p></div>
                  <span className={`status-pill${link?.sync_status === "synced" ? " is-ready" : ""}`}>{link?.sync_status === "synced" ? "已同步" : link?.sync_status === "conflict" ? "冲突" : link ? "待同步" : "未关联"}</span>
                  <div className="calendar-action-buttons">
                    <form action={queueCalendarAction}><input type="hidden" name="actionId" value={action.id} /><input type="hidden" name="allDay" value="false" /><SubmitButton className="quiet-button" disabled={!action.suggested_start_at && !action.due_at} pendingLabel="正在加入…">时间事件</SubmitButton></form>
                    <form action={queueCalendarAction}><input type="hidden" name="actionId" value={action.id} /><input type="hidden" name="allDay" value="true" /><SubmitButton className="quiet-button" disabled={!action.due_at} pendingLabel="正在加入…">全天事件</SubmitButton></form>
                  </div>
                  {action.context_type === "personal" ? (
                    <details className="calendar-edit-drawer">
                      <summary>编辑个人行动</summary>
                      <form action={updatePersonalCalendarAction} className="workspace-form compact-form">
                        <input type="hidden" name="actionId" value={action.id} />
                        <div className="field-grid">
                          <label className="field-wide"><span>可执行描述 *</span><input name="title" required maxLength={300} defaultValue={action.title} /></label>
                          <label><span>截止时间</span><input name="dueAt" type="datetime-local" defaultValue={formatCalendarDateTimeLocal(action.due_at)} /></label>
                          <label><span>建议开始</span><input name="suggestedStartAt" type="datetime-local" defaultValue={formatCalendarDateTimeLocal(action.suggested_start_at)} /></label>
                          <label><span>预计分钟</span><input name="estimatedMinutes" type="number" min={1} max={10080} defaultValue={action.estimated_minutes ?? ""} /></label>
                          <label><span>优先级</span><select name="priority" defaultValue={action.priority}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="critical">关键</option></select></label>
                          <label className="field-wide"><span>完成标准</span><textarea name="completionCriteria" rows={2} maxLength={1000} defaultValue={action.completion_criteria ?? ""} /></label>
                        </div>
                        <SubmitButton className="primary-button" pendingLabel="正在保存…">保存产品内修改</SubmitButton>
                      </form>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="calendar-two-column">
        <section className="calendar-section">
          <div className="section-heading"><p>Sources</p><h2>日历来源</h2></div>
          <div className="calendar-source-list">
            {data.sources.map((source) => <div key={source.id}><span className={source.is_product_calendar ? "source-dot is-product" : "source-dot"} /><div><strong>{source.summary}</strong><small>{source.access_role} · {source.sync_state}</small></div></div>)}
            {data.sources.length === 0 ? <p>连接后显示测试账号中的可读日历。</p> : null}
          </div>
        </section>
        <section className="calendar-section">
          <div className="section-heading"><p>Recent events</p><h2>事件镜像</h2></div>
          <div className="calendar-event-list">
            {data.events.slice(0, 12).map((event) => <div key={event.id}><span>{event.all_day ? event.starts_on : event.starts_at ? dateTime.format(new Date(event.starts_at)) : "—"}</span><div><strong>{event.summary ?? "无标题事件"}</strong><small>{sourceById.get(event.calendar_source_id)?.summary ?? "Calendar"}</small></div></div>)}
            {data.events.length === 0 ? <p>尚无已同步事件。</p> : null}
          </div>
        </section>
      </div>

      <p className="forbidden-note">只读保护：产品没有修改或删除用户原有 Calendar 事件的入口；写入仅限带稳定产品标记的独立日历事件。</p>
    </div>
  );
}
