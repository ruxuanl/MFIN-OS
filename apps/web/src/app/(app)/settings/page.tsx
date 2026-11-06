import { CapabilityPanel } from "@/components/capability-panel";
import { LogoutButton } from "@/components/logout-button";
import { PageHeader } from "@/components/page-header";
import { PasskeyRegistration } from "@/components/passkey-registration";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthMode } from "@/lib/config";

export const metadata = { title: "设置" };

const connections = [
  ["Google 身份", "M1", "仅基础登录"],
  ["Google Calendar", "M4", "打开独立授权与同步中心"],
  ["Gmail", "M6", "打开只读连接与同步中心"],
] as const;

export default async function SettingsPage() {
  const user = await getCurrentUser();
  const authMode = getAuthMode();
  const canRegisterPasskey = authMode === "supabase" && Boolean(user && !user.isMock);

  return (
    <div className="page-shell settings-page">
      <PageHeader eyebrow="Control center" title="设置" description="外部连接与自动化默认关闭。这里展示真实能力，不用开关伪装尚未实现的权限。" />

      <section className="settings-section">
        <div className="section-heading"><p>Device</p><h2>这台设备</h2></div>
        <CapabilityPanel />
      </section>

      <section className="settings-section">
        <div className="section-heading"><p>Identity</p><h2>身份与验证</h2></div>
        <div className="settings-surface">
          <div className="setting-action">
            <div><strong>当前会话</strong><p>{user?.isMock ? "合成身份 · 仅本地开发" : user?.email ?? "未登录"}</p></div>
            <span className={`status-pill${user ? " is-ready" : ""}`}>{user ? "有效" : "未连接"}</span>
          </div>
          {canRegisterPasskey ? (
            <div className="setting-action">
              <div><strong>退出登录</strong><p>仅结束这台设备上的当前会话，不影响其他设备。</p></div>
              <LogoutButton />
            </div>
          ) : null}
          <PasskeyRegistration enabled={canRegisterPasskey} />
        </div>
      </section>

      <section className="settings-section">
        <div className="section-heading"><p>Control plane</p><h2>权限与状态</h2></div>
        <Link className="settings-status-link" href="/status">
          <div><strong>打开状态中心</strong><p>查看服务器权限、隐私锁、任务队列和审计记录。</p></div>
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section className="settings-section">
        <div className="section-heading"><p>Connections</p><h2>外部连接</h2></div>
        <div className="connection-list">
          {connections.map(([name, phase, state]) => (
            <article className="connection-row" key={name}>
              <div><strong>{name}</strong><p>{state}</p></div>
              {name === "Google Calendar" || name === "Gmail" ? <Link className="phase-chip" href={name === "Gmail" ? "/inbox" : "/calendar"}>{phase} →</Link> : <span className="phase-chip">{phase}</span>}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
import Link from "next/link";
