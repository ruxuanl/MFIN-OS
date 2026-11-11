export const primaryNavigation = [
  { href: "/", label: "今日行动", shortLabel: "今日", icon: "today" },
  { href: "/internships", label: "实习", shortLabel: "实习", icon: "briefcase" },
  { href: "/graduate", label: "秋招", shortLabel: "秋招", icon: "compass" },
  { href: "/academics", label: "学业", shortLabel: "学业", icon: "book" }
] as const;

export const secondaryNavigation = [
  { href: "/calendar", label: "日历同步", description: "查看 Google Calendar 连接、同步进度和冲突。", icon: "calendar" },
  { href: "/review", label: "复盘", description: "查看晨间简报、晚间收尾与每周复盘。", icon: "chart" },
  { href: "/inbox", label: "收件箱", description: "集中处理导入的信息与待确认事项。", icon: "inbox" },
  { href: "/materials", label: "材料", description: "管理简历、申请快照和课程资料。", icon: "file" },
  { href: "/search", label: "搜索", description: "跨行动、申请、课程和材料查找信息。", icon: "search" },
  { href: "/status", label: "状态中心", description: "检查权限、隐私锁、队列与审计记录。", icon: "shield" },
  { href: "/settings", label: "设置", description: "管理设备、身份验证和外部连接。", icon: "settings" }
] as const;

export const mobileMoreHrefs = secondaryNavigation.map((item) => item.href);

export function isNavigationActive(pathname: string, href: string, additionalHrefs: readonly string[] = []) {
  return [href, ...additionalHrefs].some((candidate) =>
    candidate === "/" ? pathname === "/" : pathname === candidate || pathname.startsWith(`${candidate}/`)
  );
}

export type IconName =
  | (typeof primaryNavigation)[number]["icon"]
  | (typeof secondaryNavigation)[number]["icon"]
  | "arrow"
  | "check"
  | "logout"
  | "more"
  | "shield"
  | "sparkle";
