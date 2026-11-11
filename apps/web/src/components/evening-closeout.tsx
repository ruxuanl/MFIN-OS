import { closeOutAction } from "@/app/(app)/reports/actions";
import { SubmitButton } from "@/components/operation-feedback";
import type { ReportItem } from "@/lib/reports/data";

export function EveningCloseout({ items }: { items: ReportItem[] }) {
  if (items.length === 0) return null;
  return <section className="evening-closeout">
    <div className="report-section-heading"><h3>逐项收尾</h3><span>{items.length}</span></div>
    <div className="closeout-list">{items.map((item) => <article key={item.id}>
      <div><strong>{item.title}</strong><p>{item.reason}</p></div>
      <div className="closeout-actions">
        {[["completed", "完成"], ["continue", "继续"], ["waiting", "等待"], ["cancelled", "取消"], ["downgraded", "降级"]].map(([outcome, label]) => <form action={closeOutAction} key={outcome}><input type="hidden" name="actionId" value={item.action_id ?? ""} /><SubmitButton className="quiet-button" name="outcome" value={outcome} disabled={!item.action_id}>{label}</SubmitButton></form>)}
        <form action={closeOutAction} className="reschedule-form"><input type="hidden" name="actionId" value={item.action_id ?? ""} /><input type="datetime-local" name="rescheduleAt" required /><SubmitButton className="primary-button" name="outcome" value="rescheduled" disabled={!item.action_id} pendingLabel="正在重排…">重排</SubmitButton></form>
      </div>
    </article>)}</div>
  </section>;
}
