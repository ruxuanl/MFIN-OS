import Link from "next/link";

import { ActiveLink } from "@/components/active-link";
import { Icon } from "@/components/icon";
import { LogoutButton } from "@/components/logout-button";
import { SearchShortcut } from "@/components/search-shortcut";
import { SubmitButton } from "@/components/operation-feedback";
import { mobileMoreHrefs, primaryNavigation, secondaryNavigation } from "@/lib/navigation";
import { getNavigationUpdateHrefs } from "@/lib/navigation-updates";
import type { AppUser } from "@/lib/auth/types";

export async function AppShell({ user, children }: { user: AppUser; children: React.ReactNode }) {
  const updateHrefs = await getNavigationUpdateHrefs(user.id, user.isMock);
  const hasSecondaryUpdate = secondaryNavigation.some((item) => updateHrefs.has(item.href));

  return (
    <div className="app-frame">
      <a className="skip-link" href="#workspace-content">跳到内容</a>
      <aside className="sidebar">
        <Link href="/" className="brand" aria-label="MFin OS 首页">
          <span className="brand-mark">M</span>
          <span><strong>MFin OS</strong><small>个人工作台</small></span>
        </Link>

        <nav className="primary-nav" aria-label="主要导航">
          {primaryNavigation.map((item) => (
            <ActiveLink key={item.href} {...item} hasUpdate={updateHrefs.has(item.href)} />
          ))}
        </nav>

        <nav className="secondary-nav" aria-label="辅助导航">
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

      <div className="main-canvas">
        <header className="workspace-topbar">
          <form action="/search" className="global-search" role="search">
            <label className="global-search-icon" htmlFor="workspace-search" aria-label="搜索"><Icon name="search" size={18} /></label>
            <input id="workspace-search" name="q" maxLength={200} aria-label="搜索整个工作台" placeholder="搜索岗位、候选、邮件…" />
            <SubmitButton className="search-submit" aria-label="开始搜索" pendingLabel="搜索中…"><kbd>↵</kbd></SubmitButton>
          </form>
          <SearchShortcut />
          <div className="topbar-actions">
            <ActiveLink href="/inbox" label="收件箱" icon="inbox" hasUpdate={updateHrefs.has("/inbox")} />
            <Link href="/status" className="icon-button" aria-label="权限与隐私锁"><Icon name="shield" size={19} /></Link>
          </div>
        </header>
        <main id="workspace-content" tabIndex={-1}>{children}</main>
      </div>

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
