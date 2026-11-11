import Link from "next/link";

import { generateReportAction } from "@/app/(app)/reports/actions";
import { Icon } from "@/components/icon";
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
        title="今天，先做重要的事。"
        description="固定日程、必须事项与前三项行动汇成一份可在两分钟内读完的简报；每条结论都保留排序依据与数据截止点。"
        action={<span className="phase-badge">M5 · Daily brief</span>}
      />
      {notice && notices[notice] ? <p className="status-notice">{notices[notice]}</p> : null}

      <section className="focus-card report-focus-card">
        <div className="focus-heading">
          <div className="focus-icon"><Icon name="sparkle" size={20} /></div>
          <div><p>Top focus</p><h2>{focus[0]?.title ?? "等待生成第一份晨间简报"}</h2></div>
          <span>{focus.length} / 3</span>
        </div>
        <p className="focus-copy">{focus[0]?.reason ?? "开启报告权限后，可用现有 Action 与 Calendar 数据生成；数据未就绪时不会制造占位结论。"}</p>
        <div className="focus-line" />
        <div className="report-meta-line">
          <span>{morning ? `数据截止 ${cutoffFormatter.format(new Date(morning.data_cutoff_at))}` : schedule ? formatSchedule(schedule) : "默认每天 08:00"}</span>
          <span>{strategyLabel(morning?.generation_strategy)}</span>
          <span>{unavailable} 个来源尚不可用</span>
        </div>
      </section>

      {!morning ? (
        <section className="report-empty-callout">
          <div><p className="page-eyebrow">Morning brief</p><h2>{data.reportPermission.allowed ? "生成今天的行动简报" : "报告权限尚未开启"}</h2><p>{data.reportPermission.allowed ? "将从隔离数据库读取现有行动与日历镜像，生成不可变版本。" : "到状态中心开启“报告生成”；隐私锁开启时服务器仍会拒绝执行。"}</p></div>
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
          <ReportSection section="focus" items={focus} />
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
