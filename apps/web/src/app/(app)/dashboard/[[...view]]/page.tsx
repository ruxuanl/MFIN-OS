import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getDashboard } from "@/lib/dashboard/data";
import { Dashboard } from "@/components/dashboard/dashboard";
import "../dashboard.css";

export const metadata = { title: "Dashboard · MFIN OS" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: { params: Promise<{ view?: string[] }> }) {
  const { view } = await params;
  const section = view?.[0] ?? "overview";
  if ((view?.length ?? 0) > 1 || !["overview", "internships", "mail"].includes(section)) notFound();
  const user = await requireUser();
  let data;
  try { data = await getDashboard(user); } catch {
    return <div className="dash-error"><p className="eyebrow">DASHBOARD</p><h1>暂时无法读取统计数据</h1><p>请检查隐私锁、数据库连接及迁移状态后重试。为避免误导，本次不显示零值统计。</p><Link href="/status">查看状态中心 →</Link></div>;
  }
  return <Dashboard data={data} section={section as "overview" | "internships" | "mail"} />;
}
