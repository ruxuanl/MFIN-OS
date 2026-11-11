import { generateReportAction, updateReportSchedule } from "@/app/(app)/reports/actions";
import { EveningCloseout } from "@/components/evening-closeout";
import { NotificationReadReceipt } from "@/components/notification-read-receipt";
import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/operation-feedback";
import { ReportSection } from "@/components/report-section";
import { requireUser } from "@/lib/auth/session";
import { getReportCenterData } from "@/lib/reports/data";
import { formatSchedule, groupReportItems, reportLabels, strategyLabel } from "@/lib/reports/model";

export const metadata = { title: "复盘" };

const notices: Record<string, string> = {
  generated: "报告已生成并保留为新版本。",
  schedule_saved: "报告计划已更新；下次运行时间已重新计算。",
  schedule_failed: "计划未更新，请检查时间格式。",
  permission_required: "报告权限或隐私锁阻止了生成。",
  generate_failed: "报告生成失败，旧版本未被覆盖。",
  invalid: "请求参数无效。",
  closeout_saved: "晚间收尾已记录；事项不会被无脑滚动到明天。",
  closeout_failed: "事项未更新，原状态保持不变。",
  reschedule_required: "重排需要选择新的日期与时间。"
};

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const user = await requireUser();
  const data = await getReportCenterData(user);
  const { notice } = await searchParams;

  return <div className="page-shell report-page review-page">
    <NotificationReadReceipt />
    <PageHeader eyebrow="Reports & review" title="复盘" description="配置晨报、晚间收尾与周报，并查看每份报告的数据截止、来源健康、规则版本和不可变历史。" action={<span className="phase-badge">M5 · Reports</span>} />
    {notice && notices[notice] ? <p className="status-notice">{notices[notice]}</p> : null}

    <section className="report-schedule-grid">
      {data.schedules.map((schedule) => <article key={schedule.id} className="report-schedule-card">
        <div><p>{schedule.report_type}</p><h2>{reportLabels[schedule.report_type as keyof typeof reportLabels]}</h2><small>{formatSchedule(schedule)}</small></div>
        <form action={updateReportSchedule}>
          <input type="hidden" name="reportType" value={schedule.report_type} />
          <label><span>生成时间</span><input type="time" name="localTime" defaultValue={schedule.local_time.slice(0, 5)} /></label>
          <label className="schedule-toggle"><input type="checkbox" name="enabled" defaultChecked={schedule.enabled} /><span>启用计划</span></label>
          <SubmitButton className="quiet-button" pendingLabel="正在保存…">保存</SubmitButton>
        </form>
        <div className="schedule-status"><span className={`status-pill${schedule.last_status === "ready" ? " is-ready" : ""}`}>{schedule.enabled ? schedule.last_status : "paused"}</span><small>{schedule.next_run_at ? `下次 ${new Date(schedule.next_run_at).toLocaleString("zh-CN", { timeZone: schedule.time_zone })}` : "计划已暂停"}</small></div>
      </article>)}
    </section>

    <div className="report-history-list">
      {(["morning", "evening", "weekly"] as const).map((reportType) => {
        const report = data.reports.find((item) => item.report_type === reportType);
        const items = report ? data.items.filter((item) => item.report_id === report.id) : [];
        const grouped = groupReportItems(items);
        return <section className="report-history-card" key={reportType}>
          <div className="report-history-heading">
            <div><p>{reportType}</p><h2>{reportLabels[reportType]}</h2>{report ? <small>{report.report_date} · v{report.version} · 截止 {new Date(report.data_cutoff_at).toLocaleString("zh-CN")} · {strategyLabel(report.generation_strategy)}</small> : <small>尚无报告版本</small>}</div>
            <form action={generateReportAction}><input type="hidden" name="reportType" value={reportType} /><input type="hidden" name="returnTo" value="/review" /><SubmitButton className="quiet-button" disabled={!data.reportPermission.allowed} pendingLabel="正在生成…">立即生成</SubmitButton></form>
          </div>
          {report ? <><p className="report-summary">{report.summary}</p>{reportType === "evening" ? <EveningCloseout items={grouped.get("incomplete") ?? []} /> : Array.from(grouped.entries()).map(([section, sectionItems]) => <ReportSection key={section} section={section} items={sectionItems} compact />)}</> : <p className="workspace-empty small-empty">开启报告权限后生成；没有数据时会明确显示空报告，不用低质量内容凑数。</p>}
        </section>;
      })}
    </div>
  </div>;
}
