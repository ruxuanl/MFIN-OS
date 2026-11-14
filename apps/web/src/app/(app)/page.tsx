import Link from "next/link";

import { generateReportAction } from "@/app/(app)/reports/actions";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/operation-feedback";
import { ReportSection } from "@/components/report-section";
import { requireUser } from "@/lib/auth/session";
import { getReportCenterData } from "@/lib/reports/data";
import { formatSchedule, groupReportItems, strategyLabel } from "@/lib/reports/model";

const dateFormatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: "Asia/Hong_Kong" });
const cutoffFormatter = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong" });

const notices: Record<string, string> = {
  generated: "今日简报已按最新数据重新生成。",
  permission_required: "报告权限或隐私锁阻止了生成；请先到状态中心检查。",
  generate_failed: "报告生成失败，原有报告版本保持不变。"
};

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const data = await getReportCenterData(user);
  const { notice } = await searchParams;
  const morning = data.reports.find((report) => report.report_type === "morning");
  const items = morning ? data.items.filter((item) => item.report_id === morning.id) : [];
  const grouped = groupReportItems(items);
  const focus = grouped.get("focus") ?? [];
  const schedule = data.schedules.find((item) => item.report_type === "morning");
  const health = morning?.source_health && typeof morning.source_health === "object" && !Array.isArray(morning.source_health)
    ? morning.source_health as Record<string, unknown>
    : {};
  const unavailable = Array.isArray(health.unavailableSources) ? health.unavailableSources.length : 3;

  return (
    <div className="page-shell today-page report-page">
      <PageHeader
        eyebrow={dateFormatter.format(new Date())}
        title="今日行动"
        description="先处理重要的事，再安排今天。"
        action={<Link className="quiet-button" href="/calendar">查看日程</Link>}
      />
      {notice && notices[notice] ? <p className="status-notice">{notices[notice]}</p> : null}

      <section className="focus-card report-focus-card">
        <div className="focus-heading"><div><h2>今日重点</h2></div><span>{focus.length} / 3</span></div>
        {focus.length ? <ol className="today-focus-list">{focus.slice(0, 3).map((item, index) => <li key={item.id}>
          <span>{index + 1}</span><div><strong>{item.title}</strong><p>{item.reason}</p></div>
          {item.target_path ? <Link className="quiet-link" href={item.target_path}>查看</Link> : null}
        </li>)}</ol> : <p className="empty-focus">生成晨间简报后，在这里查看今天最重要的行动。</p>}
        <div className="report-meta-line">
          <span>{morning ? `数据截止 ${cutoffFormatter.format(new Date(morning.data_cutoff_at))}` : schedule ? formatSchedule(schedule) : "默认每天 08:00"}</span>
          <span>{strategyLabel(morning?.generation_strategy)}</span>
          <Link href="/status">{unavailable ? `${unavailable} 个来源待检查 ↗` : "查看来源状态 ↗"}</Link>
        </div>
      </section>

      {!morning ? (
        <section className="report-empty-callout">
          <div><h2>{data.reportPermission.allowed ? "生成今天的行动简报" : "报告权限尚未开启"}</h2><p>{data.reportPermission.allowed ? "根据现有行动与日程，整理今天的安排。" : "到状态中心开启“报告生成”；隐私锁开启时服务器仍会拒绝执行。"}</p></div>
          {data.reportPermission.allowed ? <form action={generateReportAction}><input type="hidden" name="reportType" value="morning" /><input type="hidden" name="returnTo" value="/" /><SubmitButton className="primary-button" pendingLabel="正在生成…">生成晨间简报</SubmitButton></form> : <Link className="primary-button" href="/status">检查报告权限</Link>}
        </section>
      ) : (
        <div className="report-toolbar"><p>{morning.summary}</p><form action={generateReportAction}><input type="hidden" name="reportType" value="morning" /><input type="hidden" name="returnTo" value="/" /><SubmitButton className="quiet-button" pendingLabel="正在生成…">按最新数据重新生成</SubmitButton></form></div>
      )}

      {morning ? <div className="report-layout">
        <div className="report-main-column">
          <ReportSection section="schedule" items={grouped.get("schedule") ?? []} />
          <ReportSection section="must_do" items={grouped.get("must_do") ?? []} />
          <ReportSection section="deadline" items={grouped.get("deadline") ?? []} />

        </div>
        <aside className="report-side-column">
          <ReportSection section="internship" items={grouped.get("internship") ?? []} compact />
          <ReportSection section="graduate" items={grouped.get("graduate") ?? []} compact />
          <ReportSection section="risk" items={grouped.get("risk") ?? []} compact />
        </aside>
      </div> : null}
    </div>
  );
}
