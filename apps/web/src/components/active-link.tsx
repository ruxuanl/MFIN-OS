"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Icon } from "@/components/icon";
import { isNavigationActive, type IconName } from "@/lib/navigation";

export function ActiveLink({
  href,
  label,
  icon,
  compact = false,
  activeHrefs = [],
  hasUpdate = false
}: {
  href: string;
  label: string;
  icon: IconName;
  compact?: boolean;
  activeHrefs?: readonly string[];
  hasUpdate?: boolean;
}) {
  const pathname = usePathname();
  const active = isNavigationActive(pathname, href, activeHrefs);

  return (
    <Link
      href={href}
      className={`${compact ? "mobile-nav-link" : "nav-link"}${active ? " is-active" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={`${label}${hasUpdate ? "，有待处理更新" : ""}`}
    >
      <Icon name={icon} size={compact ? 19 : 18} />
      <span>{label}</span>
      {hasUpdate ? <span className="navigation-update-dot" aria-hidden="true" /> : null}
    </Link>
  );
}
