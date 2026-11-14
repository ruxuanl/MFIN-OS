import Link from "next/link";

import { ActiveLink } from "@/components/active-link";
import { Icon } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { mobileMoreHrefs, primaryNavigation, secondaryNavigation } from "@/lib/navigation";
import { getNavigationUpdateHrefs } from "@/lib/navigation-updates";
import type { AppUser } from "@/lib/auth/types";

export async function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const updateHrefs = await getNavigationUpdateHrefs(user.id, user.isMock);
  const hasSecondaryUpdate = secondaryNavigation.some((item) => updateHrefs.has(item.href));

  return (
    <div className="app-frame">
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="MFin OS 首页">
          <span className="brand-mark">M</span>
          <span><strong>MFin OS</strong><small>个人工作台</small></span>
        </Link>

        <nav className="primary-nav" aria-label="主要导航">
          <p className="nav-eyebrow">工作区</p>
          {primaryNavigation.map((item) => (
            <ActiveLink key={item.href} {...item} hasUpdate={updateHrefs.has(item.href)} />
          ))}
        </nav>

        <nav className="secondary-nav" aria-label="辅助导航">
          <p className="nav-eyebrow">资料与工具</p>
          {secondaryNavigation.map((item) => (
            <ActiveLink key={item.href} {...item} hasUpdate={updateHrefs.has(item.href)} />
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-avatar">{user.displayName.slice(0, 1).toUpperCase()}</div>
          <div className="user-summary">
            <strong>{user.displayName}</strong>
            <small>{user.isMock ? "隔离预览模式" : user.email}</small>
          </div>
          <div className="sidebar-actions">
            <Link href="/settings" className="icon-button" aria-label="打开设置">
              <Icon name="settings" size={17} />
            </Link>
            {user.isMock ? null : <LogoutButton iconOnly />}
          </div>
        </div>
      </aside>

      <main className="main-canvas">{children}</main>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        {primaryNavigation.map((item) => (
          <ActiveLink
            key={item.href}
            href={item.href}
            label={item.shortLabel}
            icon={item.icon}
            compact
            hasUpdate={updateHrefs.has(item.href)}
          />
        ))}
        <ActiveLink href="/more" label="更多" icon="more" activeHrefs={mobileMoreHrefs} compact hasUpdate={hasSecondaryUpdate} />
      </nav>
    </div>
  );
}
