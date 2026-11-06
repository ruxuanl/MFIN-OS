import Link from "next/link";

import { Icon } from "@/components/icon";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { secondaryNavigation } from "@/lib/navigation";
import { getNavigationUpdateHrefs } from "@/lib/navigation-updates";

export const metadata = { title: "更多" };

export default async function MorePage() {
  const user = await requireUser();
  const updateHrefs = await getNavigationUpdateHrefs(user.id, user.isMock);

  return (
    <div className="page-shell more-page">
      <PageHeader
        eyebrow="All tools"
        title="更多"
        description="日历、报告、收件箱和系统控制集中在这里。手机与电脑使用同一账户和云端数据。"
      />

      <nav className="more-grid" aria-label="全部辅助功能">
        {secondaryNavigation.map((item) => (
          <Link
            className="more-card"
            href={item.href}
            key={item.href}
            aria-label={`${item.label}${updateHrefs.has(item.href) ? "，有待处理更新" : ""}`}
          >
            <span className="more-card-icon"><Icon name={item.icon} size={21} /></span>
            <span className="more-card-copy">
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
            <span className="more-card-arrow" aria-hidden="true">→</span>
            {updateHrefs.has(item.href) ? <span className="navigation-update-dot" aria-hidden="true" /> : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
