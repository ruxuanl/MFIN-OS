import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { OperationLink, SubmitButton } from "@/components/operation-feedback";
import { ReauthenticateControl } from "@/components/reauthenticate-control";
import { CalendarMonth } from "@/components/calendar-month";
import { requireUser } from "@/lib/auth/session";
import { PRODUCT_CALENDAR_TIME_ZONE } from "@/lib/calendar/constants";
import { getCalendarCenterData, type CalendarAction } from "@/lib/calendar/data";
import { formatCalendarDateTimeLocal } from "@/lib/calendar/model";
import { calendarDay, calendarMonth, monthDays, type CalendarDisplayEvent } from "@/lib/calendar/view-model";
import { readCalendarView } from "@/lib/calendar/service";
import { calendarFailureNotice } from "@/lib/calendar/errors";
import { getCalendarOAuthConfig, isCalendarServerConfigured } from "@/lib/config";
import { createScheduledAction, disconnectCalendarAction, queueCalendarAction, resolveCalendarConflictAction, setCalendarConnectionState, triggerCalendarSync, updatePersonalCalendarAction } from "./actions";
import { CalendarSyncSubmitButton } from "./sync-submit-button";
import "./calendar-view.css";

export const metadata = { title: "日历同步" };
const notices: Record<string, string> = {
  queued_not_configured: "行动已加入待同步队列，请先连接 Google Calendar。",
  not_configured: "M4 服务端密钥尚未配置；当前不会启动外部授权。",
  connection_permission_required: "请先在状态中心开启 Calendar 连接和日历读取权限。",
  reauth_required: "连接或断开 Calendar 前需要新的 Passkey / Face ID 或重新登录证明。",
  oauth_cancelled: "Google Calendar 授权已取消，未保存凭据。",
  oauth_state_invalid: "OAuth 状态校验失败，未保存凭据，请重新开始。",
  connection_failed: "Calendar 连接或初始化失败；没有把失败伪装为已连接。",
  connected: "Google Calendar 已连接，产品日历与四类标签已初始化。",
  reauthorization_required: "Google 授权已失效，请重新连接 Google Calendar。测试模式授权可能在 7 天后过期。",
  oauth_client_invalid: "Google OAuth 客户端配置无效，请核对服务端客户端 ID 与密钥。",
  oauth_scope_missing: "Google 尚未授予全部必需的日历权限，请重新连接并勾选三项日历权限。",
  oauth_scope_expanded: "Google 返回了日历接入范围以外的权限，本次连接已停止。请使用独立的 Calendar OAuth 客户端。",
  calendar_api_disabled: "此 Google Cloud 项目尚未启用 Google Calendar API。启用后可点击立即同步重试。",
  privacy_locked: "隐私锁已开启，日历连接和同步已停止。请在设置中重新验证并解除隐私锁。",
  invalid: "请求无效，未执行任何变更。",
  schedule_required: "请先为行动填写日期或开始时间。",
  queue_failed: "未能加入同步队列；隐私锁或数据约束可能仍在生效。",
  queued: "事项已进入持久化同步队列；权限关闭时会保持待同步。",
  sync_failed: "同步失败，错误状态已保留，可在修复连接后重试。",
  synced: "Calendar 增量同步与待处理写入已完成。",
  sync_pending: "日程读取已完成；仍有事项待同步或同步失败，请检查候选池状态、连接与写入权限后重试。",
  sync_conflicts: "Calendar 同步已完成，但存在需要你选择处理方式的冲突。",
  paused: "Calendar 已暂停；令牌保留，但不会读取或写入。",
  resumed: "Calendar 已恢复；历史不会自动补跑，请主动同步。",
  connection_state_failed: "连接状态未更新。",
  disconnected: "Calendar 已断开，Google 授权已撤销，Vault 凭据已删除。",
  disconnected_revoke_failed: "本地连接和 Vault 凭据已删除；Google 远端撤销未确认，请在 Google 账号中复核。",
  disconnect_failed: "断开失败；连接状态保持可见，请重新验证后重试。",
  conflict_failed: "冲突未解决；远端和产品状态均未被静默覆盖。",
  conflict_resolved: "冲突已按你的选择处理，并追加时间线与审计。",
  action_created: "行动已保存到候选池，确认同步后会出现在 Google Calendar。",
  action_failed: "个人行动创建失败，请检查标题和时间。",
  action_updated: "个人行动已更新；Google Calendar 尚未改动，请点击“立即同步”完成外部更新。",
  action_unchanged: "没有检测到字段变化；Google Calendar 未执行更新。",
  action_update_failed: "个人行动更新失败；原记录和 Calendar 事件均未被改动。",
  action_update_conflict: "个人行动的并发修改已进入冲突队列；没有静默覆盖另一端的新值。"
};


const statusLabels: Record<string, string> = { connected: "已连接", paused: "已暂停", disconnected: "未连接", connecting: "连接中", error: "连接异常" };
const resolutionOptions: Record<string, Array<{ value: string; label: string }>> = {
  remote_deleted: [{ value: "cancel_schedule", label: "取消排期" }, { value: "resync", label: "重新同步" }],
  concurrent_change: [{ value: "accept_calendar", label: "采用 Calendar 时间" }, { value: "use_product", label: "采用产品排期" }],
  write_protected: [{ value: "keep_read_only", label: "保持只读" }]
};
const dateTime = new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: PRODUCT_CALENDAR_TIME_ZONE });

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ notice?: string; month?: string }> }) {
  const user = await requireUser();
  const data = await getCalendarCenterData(user);
  const { notice, month: requestedMonth } = await searchParams;
  const today = calendarDay(new Date());
  const month = calendarMonth(requestedMonth, today);
  const days = monthDays(month);
  const configured = isCalendarServerConfigured();
  const connectionStatus = data.connection?.status ?? "disconnected";
  const linkByAction = new Map(data.links.map(link => [link.action_id, link]));
  const sourceById = new Map(data.sources.map(source => [source.id, source]));
  const actionById = new Map(data.actions.map(action => [action.id, action]));
  let events: CalendarDisplayEvent[] = data.events.filter(event => event.status !== "cancelled").flatMap(event => {
    const start = event.starts_on ?? event.starts_at;
    return start ? [{ id: event.id, title: event.summary ?? "无标题日程", source: sourceById.get(event.calendar_source_id)?.summary ?? "Google Calendar", productOwned: event.product_owned, actionId: event.product_action_id, allDay: event.all_day, start, end: event.ends_on ?? event.ends_at, url: event.html_link, location: event.location }] : [];
  });
  let viewError: string | null = null;
  let live = false;
  if (configured && !data.isMock && connectionStatus === "connected") {
    try {
      const end = new Date(days[41] + "T00:00:00+08:00");
      end.setUTCDate(end.getUTCDate() + 1);
      events = await readCalendarView(user.id, getCalendarOAuthConfig(), days[0] + "T00:00:00+08:00", end.toISOString());
      live = true;
    } catch (error) { viewError = calendarFailureNotice(error); }
  }
  const candidates = data.actions.filter(action => action.status !== "completed" && action.status !== "cancelled" && linkByAction.get(action.id)?.sync_status !== "synced");
  const synced = data.actions.filter(action => linkByAction.get(action.id)?.sync_status === "synced");
  events = events.map(event => ({ ...event, priority: event.actionId ? actionById.get(event.actionId)?.priority ?? null : null }));

  function renderAction(action: CalendarAction, confirmed = false) {
    const link = linkByAction.get(action.id);
    return <article key={action.id}>
      <div><strong>{action.title}</strong><p>{action.suggested_start_at ? "开始 " + dateTime.format(new Date(action.suggested_start_at)) : action.due_at ? "截止 " + dateTime.format(new Date(action.due_at)) : "尚未设置日期 · 请先编辑排期"}</p></div>
      <span className={"status-pill" + (confirmed ? " is-ready" : "")}>{confirmed ? "已同步" : link?.sync_status === "conflict" ? "冲突待处理" : link?.sync_status === "failed" ? "同步失败" : link ? "待同步" : "待确认"}</span>
      <div className="calendar-action-buttons">
        {!confirmed ? <>
          <form action={queueCalendarAction}><input type="hidden" name="actionId" value={action.id} /><input type="hidden" name="allDay" value="false" /><SubmitButton className="quiet-button" disabled={link?.sync_status === "conflict" || (!action.suggested_start_at && !action.due_at)} pendingLabel="正在同步…">确认同步时间事件</SubmitButton></form>
          <form action={queueCalendarAction}><input type="hidden" name="actionId" value={action.id} /><input type="hidden" name="allDay" value="true" /><SubmitButton className="quiet-button" disabled={link?.sync_status === "conflict" || !action.due_at} pendingLabel="正在同步…">确认同步全天事件</SubmitButton></form>
        </> : null}
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

    </article>;
  }

  return <div className="page-shell calendar-page">
    <PageHeader eyebrow="" title="日历同步" description="查看未来日程，确认行动排期后同步到 Google Calendar。" />
    {notice && notices[notice] ? <p className="status-notice" role="status">{notices[notice]}</p> : null}
    <section className="calendar-section calendar-overview" aria-labelledby="calendar-heading">
      <div className="calendar-section-header">
        <div><h2 id="calendar-heading">Calendar</h2><p className="calendar-muted">Google Calendar · 香港时间{live ? " · 已读取最新日程" : data.connection?.lastSuccessAt ? " · 上次同步 " + dateTime.format(new Date(data.connection.lastSuccessAt)) : " · 等待连接"}</p></div>
        <div className="calendar-toolbar-actions">
          <span className={"status-pill" + (live ? " is-ready" : "")}>{viewError ? "读取异常" : statusLabels[connectionStatus] ?? connectionStatus}</span>
          {connectionStatus === "connected" ? <form action={triggerCalendarSync}><CalendarSyncSubmitButton /></form> : connectionStatus !== "paused" ? <OperationLink className="primary-button" disabled={!configured || data.isMock} href="/api/calendar/oauth/start">连接 Google Calendar</OperationLink> : null}
          <details className="calendar-settings">
            <summary className="quiet-button">连接设置</summary>
            <div className="calendar-settings-panel">
              <strong>Google Calendar · {statusLabels[connectionStatus] ?? connectionStatus}</strong>
              <p className="calendar-muted">读取已有日程；确认的行动写入 MFIN OS 专用日历。原有日程保持只读。</p>
              <div className="calendar-connection-actions">
                {connectionStatus === "connected" ? <form action={setCalendarConnectionState}><SubmitButton className="quiet-button" name="status" value="paused">暂停连接</SubmitButton></form> : connectionStatus === "paused" ? <form action={setCalendarConnectionState}><SubmitButton className="primary-button" name="status" value="connected">恢复连接</SubmitButton></form> : null}
                <ReauthenticateControl returnTo="/calendar" />
                {connectionStatus !== "paused" ? <OperationLink className="quiet-button" disabled={!configured || data.isMock} href="/api/calendar/oauth/start">{connectionStatus === "connected" ? "重新连接 Google Calendar" : "连接 Google Calendar"}</OperationLink> : null}
                <Link className="quiet-link" href="/status">管理日历权限</Link>
                {connectionStatus === "connected" || connectionStatus === "paused" ? <form action={disconnectCalendarAction}><SubmitButton className="danger-button" pendingLabel="正在断开…">断开并撤销</SubmitButton></form> : null}
              </div>
            </div>
          </details>
        </div>
      </div>
      {viewError ? <p className="status-notice" role="status">{notices[viewError] ?? "无法读取最新日程，请重试或在连接设置中重新授权。"} 当前仅显示已保存的日程，可能缺少重复日程或最新变更。</p> : null}
      {connectionStatus === "paused" ? <p className="status-notice">连接已暂停，当前显示已保存的日程。可在连接设置中恢复。</p> : null}
      <CalendarMonth key={month} month={month} today={today} events={events} connected={connectionStatus === "connected"} />
    </section>
    <section className="calendar-section calendar-scheduling" aria-labelledby="scheduling-heading">
      <div className="calendar-section-header"><div><h2 id="scheduling-heading">行动排期同步</h2><p className="calendar-muted">候选行动确认后，直接写入上方日历，并同步到你的 Google Calendar。</p></div><a className="quiet-button" href="#new-calendar-action">新建行动与排期</a></div>
      {data.conflicts.length ? <div className="calendar-conflicts"><h3>同步冲突 · 需要你决定</h3><div className="calendar-conflict-list">{data.conflicts.map(conflict => <article key={conflict.id}>
        <strong>{conflict.conflict_type === "remote_deleted" ? "Google Calendar 中的日程已删除" : conflict.conflict_type === "concurrent_change" ? "两端的排期同时变更" : "原有日程受只读保护"}</strong>
        <div className="calendar-conflict-actions">{(resolutionOptions[conflict.conflict_type] ?? []).map(option => <form key={option.value} action={resolveCalendarConflictAction}><input type="hidden" name="conflictId" value={conflict.id} /><SubmitButton className="quiet-button" name="resolution" value={option.value}>{option.label}</SubmitButton></form>)}</div>
      </article>)}</div></div> : null}
      <h3>行动与排期候选池 <span className="calendar-muted">{candidates.length}</span></h3>
      {candidates.length ? <div className="calendar-action-list">{candidates.map(action => renderAction(action))}</div> : <p className="calendar-day-empty">暂无待确认行动。你可以在下方新建行动与排期。</p>}
      {synced.length ? <details className="calendar-synced-actions"><summary>已同步的行动 · {synced.length}</summary><div className="calendar-action-list">{synced.map(action => renderAction(action, true))}</div></details> : null}
      <div id="new-calendar-action" className="calendar-create-action">
        <h3>新建行动与排期</h3>
        <form action={createScheduledAction} className="workspace-form compact-form">
          <div className="field-grid">
            <label className="field-wide"><span>行动名称 *</span><input name="title" required maxLength={300} /></label>
            <label><span>建议开始时间</span><input name="suggestedStartAt" type="datetime-local" /></label>
            <label><span>截止时间 / 全天日期</span><input name="dueAt" type="datetime-local" /></label>
            <label><span>预计分钟</span><input name="estimatedMinutes" type="number" min={1} max={10080} /></label>
            <label><span>日程类型</span><select name="allDay" defaultValue="false"><option value="false">时间事件</option><option value="true">全天事件</option></select></label>
            <label><span>优先级</span><select name="priority" defaultValue="normal"><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="critical">关键</option></select></label>
            <label className="field-wide"><span>完成标准</span><textarea name="completionCriteria" rows={2} maxLength={1000} /></label>
          </div>
          <p className="calendar-muted">香港时间（UTC+8）。时间事件使用建议开始时间；全天事件使用截止日期。仅保存的行动不会写入 Google Calendar。</p>
          <div className="calendar-create-buttons"><SubmitButton className="primary-button" name="intent" value="sync" pendingLabel="正在创建并同步…">创建并确认同步</SubmitButton><SubmitButton className="quiet-button" name="intent" value="draft" pendingLabel="正在保存…">仅保存到候选池</SubmitButton></div>
        </form>
      </div>
    </section>
  </div>;
}
