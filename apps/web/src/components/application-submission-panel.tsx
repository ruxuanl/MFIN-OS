import { recordApplicationSubmitted, undoApplicationSubmitted } from "@/app/(app)/applications/actions";
import { SubmitButton } from "@/components/operation-feedback";
import type { ApplicationSnapshot } from "@/lib/applications/data";

const recordableStages = new Set(["new", "evaluation", "preparation", "submitted"]);

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function hongKongToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Hong_Kong" }).format(new Date());
}

export function ApplicationSubmissionPanel({
  snapshots,
  opportunityId,
  mainStage,
  returnTo
}: {
  snapshots: ApplicationSnapshot[];
  opportunityId: string;
  mainStage: string;
  returnTo: string;
}) {
  const active = snapshots.find((snapshot) => snapshot.status === "active") ?? null;
  const history = snapshots.filter((snapshot) => snapshot.status === "undone");

  return (
    <section className="detail-panel application-submission-panel">
      <div className="panel-heading">
        <div><p>Submission record</p><h3>投递记录</h3></div>
        <span className="phase-badge">只记录事实</span>
      </div>

      {active ? (
        <div className="package-block">
          <p className="package-confirmed">已记录投递：{formatDateTime(active.submitted_at)}</p>
          <dl className="snapshot-facts">
            <div><dt>岗位</dt><dd>{active.company} · {active.role_title}</dd></div>
            <div><dt>简历版本</dt><dd>{active.resume_label ?? "未在投递包中确认"}</dd></div>
            <div><dt>申请编号</dt><dd>{active.application_reference ?? "—"}</dd></div>
            <div><dt>JD 快照</dt><dd>{active.jd_text ? `${active.jd_text.length.toLocaleString("zh-CN")} 字已保存` : "无原文"}</dd></div>
          </dl>
          {active.answers_text ? <details className="raw-jd-details"><summary>查看保存的申请表答案</summary><pre>{active.answers_text}</pre></details> : null}
          <form action={undoApplicationSubmitted} className="package-inline-form">
            <input type="hidden" name="snapshotId" value={active.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <SubmitButton className="quiet-button" pendingLabel="撤销中…">撤销这条投递记录</SubmitButton>
          </form>
          <p className="section-note">快照一经保存不可修改；撤销会恢复岗位阶段、投递包和截止行动，并把快照保留为历史。</p>
        </div>
      ) : recordableStages.has(mainStage) ? (
        <form action={recordApplicationSubmitted} className="workspace-form compact-form">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <p className="section-note">先在官网完成提交，再在这里记录。系统会保存当时的 JD、确认的简历版本和材料清单，不会访问任何外部网站。</p>
          <div className="field-grid">
            <label><span>投递日期</span><input name="submittedOn" type="date" defaultValue={hongKongToday()} /></label>
            <label><span>申请编号（可选）</span><input name="applicationReference" maxLength={200} /></label>
            <label className="field-wide"><span>申请表答案（可选，保存为快照）</span><textarea name="answersText" rows={4} maxLength={20000} /></label>
          </div>
          <SubmitButton className="primary-button" pendingLabel="正在记录…">我已在官网提交，记录投递</SubmitButton>
        </form>
      ) : (
        <p className="section-note">岗位已进入后续阶段，不需要再记录投递。</p>
      )}

      {history.length ? (
        <details className="raw-jd-details">
          <summary>已撤销的投递记录（{history.length}）</summary>
          <ul className="snapshot-history">
            {history.map((snapshot) => (
              <li key={snapshot.id}>{formatDateTime(snapshot.submitted_at)} 记录，{snapshot.undone_at ? formatDateTime(snapshot.undone_at) : ""} 撤销</li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
