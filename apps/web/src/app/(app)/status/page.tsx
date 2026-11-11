import { LogoutButton } from "@/components/logout-button";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/operation-feedback";
import { ReauthenticateControl } from "@/components/reauthenticate-control";
import { requireUser } from "@/lib/auth/session";
import { getStatusCenterData } from "@/lib/status-center";

import {
  reviewJobSource,
  setCapabilityGrant,
  setPrivacyLock
} from "./actions";

export const metadata = { title: "状态中心" };

const categoryLabels: Record<string, string> = {
  ai: "AI 与自动化",
  gmail: "Gmail",
  calendar: "Google Calendar",
  job_radar: "求职雷达",
  academic: "学业处理",
  files: "文件",
  reports: "报告",
  notifications: "通知"
};

const notices: Record<string, string> = {
  preview: "隔离预览模式不会写入数据库。",
  invalid: "请求参数无效，未执行任何变更。",
  permission_failed: "权限未更新；隐私锁可能仍在生效。",
  permission_saved: "权限已更新，数据库审计记录已追加。",
  lock_failed: "隐私锁未能启用，请重试。",
  locked: "隐私锁已启用；新任务、外部读取、同步、AI 与上传已停止。",
  reauth_required: "解除隐私锁前需要新的 Passkey / Face ID 或重新登录证明。",
  unlocked: "隐私锁已解除；历史任务不会自动补跑。",
  job_source_approved: "公开来源已批准，但仍保持关闭；启用前会再次检查岗位发现权限。",
  job_source_rejected: "公开来源已拒绝并保持关闭。",
  job_source_enabled: "公开来源已启用；只有服务端只读适配器可按声明频率运行。",
  job_source_disabled: "公开来源已停用；停用不会显示为“没有新岗位”。",
  job_source_privacy_locked: "隐私锁阻止批准或启用来源；拒绝和停用仍可执行。",
  job_source_permission_required: "启用失败：请先开启“岗位发现”权限。",
  job_source_approval_required: "启用失败：该来源尚未由你批准。",
  job_source_failed: "公开来源操作失败，数据库没有接受变更。"
};

const jobSourceKindLabels: Record<string, string> = {
  company_careers: "公司官网",
  university_public: "大学公开渠道",
  public_board: "公开招聘平台",
  synthetic: "合成验收源"
};

const dateTime = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Shanghai"
});

export default async function StatusPage({
  searchParams
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const user = await requireUser();
  const data = await getStatusCenterData(user);
  const { notice } = await searchParams;
  const categories = Map.groupBy(data.capabilities, (capability) => capability.category);
  const activeTasks = (data.taskCounts.queued ?? 0) + (data.taskCounts.running ?? 0) + (data.taskCounts.cancel_requested ?? 0);
  const failedTasks = (data.taskCounts.failed ?? 0) + (data.taskCounts.dead_letter ?? 0);

  return (
    <div className="page-shell status-page">
      <PageHeader
        eyebrow="Control plane"
        title="状态中心"
        description="这里展示服务器真正执行的权限、隐私锁、连接、后台任务和审计状态。所有重要权限默认关闭。"
        action={<span className="phase-badge">Job discovery V0</span>}
      />

      {notice && notices[notice] ? <p className="status-notice" role="status">{notices[notice]}</p> : null}

      <section className={`privacy-card${data.privacyLocked ? " is-locked" : ""}`}>
        <div>
          <p className="page-eyebrow">Privacy lock</p>
          <h2>{data.privacyLocked ? "隐私锁已启用" : "隐私锁未启用"}</h2>
          <p>
            {data.privacyLocked
              ? "外部读取、AI、同步、上传和新任务已由数据库阻止；现有记录保持只读。"
              : "启用后立即取消排队任务，运行中任务在最近安全点停止。"}
          </p>
        </div>
        <div className="privacy-actions">
          {data.privacyLocked ? (
            <>
              <ReauthenticateControl />
              <form action={setPrivacyLock}>
                <SubmitButton className="primary-button" name="intent" value="unlock" pendingLabel="正在解除…">解除隐私锁</SubmitButton>
              </form>
              <LogoutButton />
            </>
          ) : (
            <form action={setPrivacyLock}>
              <SubmitButton className="danger-button" name="intent" value="lock" disabled={data.isMock} pendingLabel="正在启用…">立即启用隐私锁</SubmitButton>
            </form>
          )}
        </div>
      </section>

      <div className="status-metrics">
        <article><span>连接</span><strong>{data.connections.filter((item) => item.status === "connected").length}</strong><small>数据连接保持分阶段授权</small></article>
        <article><span>活动任务</span><strong>{activeTasks}</strong><small>排队、运行或等待安全停止</small></article>
        <article><span>失败队列</span><strong>{failedTasks}</strong><small>失败与 dead-letter 均显式保留</small></article>
        <article><span>审计事件</span><strong>{data.recentAudit.length}</strong><small>当前显示最近八条</small></article>
      </div>

      <section className="settings-section">
        <div className="section-heading"><p>Job discovery V0</p><h2>公开岗位来源控制面</h2></div>
        <p className="section-note">只允许无需登录的公开 HTTPS 来源。系统可以提出来源，但必须由你审批；未审批或未启用时不会抓取。当前切片只建设控制面和健康口径，不连接真实来源。</p>
        <article className="panel job-radar-summary">
          <div className="panel-heading">
            <div><p>Coverage</p><h3>{data.jobRadar.coverage.label}</h3></div>
            <span className={`status-pill${data.jobRadar.coverage.hasCoverage ? " is-ready" : ""}`}>{data.jobRadar.coverage.kind}</span>
          </div>
          <p className="wechat-coverage-detail">{data.jobRadar.coverage.detail}</p>
          <dl className="wechat-health-list">
            <div><dt>建议来源</dt><dd>{data.jobRadar.sources.length}</dd></div>
            <div><dt>已批准</dt><dd>{data.jobRadar.coverage.approvedCount}</dd></div>
            <div><dt>已启用</dt><dd>{data.jobRadar.coverage.enabledCount}</dd></div>
            <div><dt>健康来源</dt><dd>{data.jobRadar.coverage.healthyCount}</dd></div>
          </dl>
        </article>

        <div className="job-source-grid">
          {data.jobRadar.sources.map((source) => (
            <article className="panel job-source-card" key={source.id}>
              <div className="panel-heading">
                <div><p>{jobSourceKindLabels[source.sourceKind] ?? source.sourceKind}</p><h3>{source.displayName}</h3></div>
                <span className={`status-pill${source.healthStatus === "healthy" ? " is-ready" : ""}`}>{source.healthStatus}</span>
              </div>
              <p>{source.coverageScope}</p>
              <dl className="job-source-facts">
                <div><dt>公开域名</dt><dd>{source.sourceDomain}</dd></div>
                <div><dt>审批</dt><dd>{source.approvalStatus}</dd></div>
                <div><dt>最近成功</dt><dd>{source.lastSuccessAt ? dateTime.format(new Date(source.lastSuccessAt)) : "从未"}</dd></div>
                <div><dt>覆盖缺口</dt><dd>{source.coverageGap ?? "无已知缺口"}</dd></div>
              </dl>
              <a className="quiet-link" href={source.baseUrl} target="_blank" rel="noreferrer">查看公开来源 →</a>
              <form className="job-source-actions" action={reviewJobSource}>
                <input type="hidden" name="sourceId" value={source.id} />
                <label><span>最低间隔（分钟）</span><input name="pollingIntervalMinutes" type="number" min={60} max={10080} step={60} defaultValue={source.pollingIntervalMinutes} /></label>
                {source.approvalStatus === "pending" ? <>
                  <SubmitButton className="primary-button" name="action" value="approve" disabled={data.isMock || data.privacyLocked} pendingLabel="正在批准…">批准但保持关闭</SubmitButton>
                  <SubmitButton className="danger-button" name="action" value="reject" disabled={data.isMock} pendingLabel="正在拒绝…">拒绝</SubmitButton>
                </> : null}
                {source.approvalStatus === "approved" && !source.enabled
                  ? <SubmitButton className="primary-button" name="action" value="enable" disabled={data.isMock || data.privacyLocked} pendingLabel="正在启用…">启用只读采集</SubmitButton>
                  : null}
                {source.enabled ? <SubmitButton className="danger-button" name="action" value="disable" disabled={data.isMock} pendingLabel="正在停用…">立即停用</SubmitButton> : null}
              </form>
            </article>
          ))}
          {data.jobRadar.sources.length === 0 ? <p className="workspace-empty">尚无建议来源。D14–D16 未确认前不会替你选择公司、平台或抓取频率。</p> : null}
        </div>
      </section>



      <section className="settings-section">
        <div className="section-heading"><p>Permissions</p><h2>能力注册表</h2></div>
        <p className="section-note">“仅本次”必须绑定具体 operation ID，因此只在实际动作确认时提供；这里可设置关闭、24 小时或持续开启。</p>
        <div className="permission-groups">
          {Array.from(categories.entries()).map(([category, capabilities]) => (
            <details className="permission-group" key={category} open={category === "ai"}>
              <summary>
                <span>{categoryLabels[category] ?? category}</span>
                <small>{capabilities.filter((item) => item.state.enabled).length} / {capabilities.length} 开启</small>
              </summary>
              <div>
                {capabilities.map((capability) => (
                  <article className="permission-row" key={capability.capabilityKey}>
                    <div className="permission-copy">
                      <div><strong>{capability.label}</strong><span className={`risk-chip risk-${capability.riskLevel}`}>{capability.riskLevel}</span></div>
                      <p>{capability.description}</p>
                      <code>{capability.capabilityKey}</code>
                    </div>
                    <span className={`status-pill${capability.state.enabled ? " is-ready" : ""}`}>{capability.state.label}</span>
                    <form className="permission-actions" action={setCapabilityGrant}>
                      <input type="hidden" name="capabilityKey" value={capability.capabilityKey} />
                      <SubmitButton name="mode" value="off" disabled={data.isMock || data.privacyLocked} pendingLabel="正在关闭…">关闭</SubmitButton>
                      {capability.supportsTimed ? <SubmitButton name="mode" value="temporary" disabled={data.isMock || data.privacyLocked} pendingLabel="正在设置…">24 小时</SubmitButton> : null}
                      <SubmitButton name="mode" value="persistent" disabled={data.isMock || data.privacyLocked} pendingLabel="正在设置…">持续</SubmitButton>
                    </form>
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <div className="status-bottom-grid">
        <section className="panel">
          <div className="panel-heading"><div><p>Connections</p><h3>外部连接</h3></div><span className="muted-count">{data.connections.length}</span></div>
          <div className="status-list">
            <div><strong>Google 身份</strong><span className="status-pill is-ready">已登录</span></div>
            {data.connections.map((connection) => (
              <div key={connection.provider}><strong>{connection.provider}<small>最近成功：{connection.lastSuccessAt ? dateTime.format(new Date(connection.lastSuccessAt)) : "从未"}{connection.stale ? " · 超过 24 小时未成功同步，请核验" : ""}</small></strong><span className="status-pill">{connection.status}</span></div>
            ))}
            {data.connections.length === 0 ? <p>Calendar 与 Gmail 尚未授权。</p> : null}
            <Link className="quiet-link" href="/calendar">打开 Calendar 同步中心 →</Link>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading"><div><p>Audit</p><h3>最近审计</h3></div><span className="muted-count">{data.recentAudit.length}</span></div>
          <div className="audit-list">
            {data.recentAudit.map((event) => (
              <div key={event.id}><span>{dateTime.format(new Date(event.createdAt))}</span><strong>{event.action}</strong><small>{event.outcome}</small></div>
            ))}
            {data.recentAudit.length === 0 ? <p>尚无权限或隐私锁变更。</p> : null}
          </div>
        </section>
      </div>

      <p className="forbidden-note">永久禁止：发送邮件或微信、联系他人、岗位投递、申请提交、Offer 决策。它们不在能力注册表中，无法通过配置创建。</p>
    </div>
  );
}
