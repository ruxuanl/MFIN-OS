import { confirmPackageResume, createApplicationPackage, setPackageItem, setPackageStatus } from "@/app/(app)/applications/actions";
import { SubmitButton } from "@/components/operation-feedback";
import type { ApplicationPackageView } from "@/lib/applications/data";

const statusLabels: Record<string, string> = {
  draft: "草稿",
  ready: "准备就绪",
  submitted_recorded: "已记录投递",
  abandoned: "已放弃"
};

export function ApplicationPackagePanel({
  view,
  opportunityId,
  returnTo,
  deadline
}: {
  view: ApplicationPackageView;
  opportunityId: string;
  returnTo: string;
  deadline: string | null;
}) {
  const pkg = view.package;
  if (!pkg) {
    return (
      <section className="detail-panel application-package-panel">
        <div className="panel-heading"><div><p>Application package</p><h3>投递包</h3></div><span className="phase-badge">规则版 · 非 AI</span></div>
        <p className="section-note">根据 JD 生成材料清单、推荐简历版本{deadline ? "，并为截止日创建一条行动" : ""}。投递包只帮你准备，提交始终由你在官网完成。</p>
        <form action={createApplicationPackage}>
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton className="primary-button" pendingLabel="正在生成…">创建投递包</SubmitButton>
        </form>
      </section>
    );
  }

  const editable = pkg.status === "draft" || pkg.status === "ready";
  const requiredItems = view.items.filter((item) => item.required);
  const doneRequired = requiredItems.filter((item) => item.done).length;
  const recommended = view.resumeOptions.find((option) => option.id === pkg.recommended_resume_version_id) ?? null;
  const selected = view.resumeOptions.find((option) => option.id === pkg.selected_resume_version_id) ?? null;

  return (
    <section className="detail-panel application-package-panel">
      <div className="panel-heading">
        <div><p>Application package · {pkg.rule_version}</p><h3>投递包</h3></div>
        <span className={`stage-pill package-${pkg.status}`}>{statusLabels[pkg.status] ?? pkg.status}</span>
      </div>

      <div className="package-summary">
        <div><span>必备材料</span><strong>{doneRequired} / {requiredItems.length}</strong></div>
        <div><span>建议开始准备</span><strong>{pkg.suggested_start_on ?? "—"}</strong></div>
        <div><span>截止</span><strong>{deadline ?? "未填写"}</strong></div>
        <div><span>截止行动</span><strong>{pkg.deadline_action_id ? "已创建" : "无截止日"}</strong></div>
      </div>

      <div className="package-block">
        <h4>简历版本</h4>
        <p className="section-note">{pkg.recommendation_reason ?? "—"}</p>
        {selected
          ? <p className="package-confirmed">已确认：{selected.label} v{selected.versionNumber}</p>
          : <p className="jd-gap-note">尚未确认本次使用的简历版本。最终材料由你选择。</p>}
        {editable && view.resumeWorkspaceEnabled && view.resumeOptions.length ? (
          <form action={confirmPackageResume} className="package-inline-form">
            <input type="hidden" name="packageId" value={pkg.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <select name="resumeVersionId" defaultValue={selected?.id ?? recommended?.id ?? view.resumeOptions[0].id}>
              {view.resumeOptions.filter((option) => !option.archived || option.id === selected?.id).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label} v{option.versionNumber}{option.id === recommended?.id ? "（推荐）" : ""}
                </option>
              ))}
            </select>
            <SubmitButton className="quiet-button" pendingLabel="保存中…">使用此版本</SubmitButton>
          </form>
        ) : null}
      </div>

      <div className="package-block">
        <h4>材料清单</h4>
        <ul className="package-checklist">
          {view.items.map((item) => (
            <li key={item.id} className={item.done ? "is-done" : undefined}>
              <form action={setPackageItem}>
                <input type="hidden" name="itemId" value={item.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="done" value={item.done ? "false" : "true"} />
                <SubmitButton className="package-check" disabled={!editable} aria-pressed={item.done} pendingLabel="…"
                  aria-label={`${item.done ? "取消完成" : "标记完成"}：${item.label}`}>{item.done ? "✓" : ""}</SubmitButton>
              </form>
              <div>
                <strong>{item.label}</strong>{item.required ? null : <small>（可选）</small>}
                {item.evidence ? <small className="package-evidence">JD 原文：“{item.evidence}”</small> : null}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="package-footer">
        {pkg.official_apply_url
          ? <a className="primary-button" href={pkg.official_apply_url} target="_blank" rel="noreferrer noopener">打开官方申请页 ↗</a>
          : <span className="section-note">JD 中没有可识别的 HTTPS 申请链接，请自行前往官网。</span>}
        {editable ? (
          <div className="package-status-actions">
            <form action={setPackageStatus}>
              <input type="hidden" name="packageId" value={pkg.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="status" value={pkg.status === "ready" ? "draft" : "ready"} />
              <SubmitButton className="quiet-button" pendingLabel="保存中…">{pkg.status === "ready" ? "改回草稿" : "标记准备就绪"}</SubmitButton>
            </form>
            <form action={setPackageStatus}>
              <input type="hidden" name="packageId" value={pkg.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="status" value="abandoned" />
              <SubmitButton className="quiet-button" pendingLabel="保存中…">放弃本次申请</SubmitButton>
            </form>
          </div>
        ) : null}
      </div>
      <p className="section-note package-boundary">系统不会代你填写或提交申请表。在官网提交后，请在下方“投递记录”中记录。</p>
    </section>
  );
}
