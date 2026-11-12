import { generateApplicationDrafts, saveApplicationDraft, unlockApplicationDraft } from "@/app/(app)/applications/draft-actions";
import { SubmitButton } from "@/components/operation-feedback";
import { draftFieldLabel } from "@/lib/ai/application-pack";
import type { ApplicationDraft } from "@/lib/applications/data";

type Evidence = { claim?: string; source?: string; quote?: string };

const fieldOrder = ["gap_explanation", "tailoring_points", "cover_letter", "qa_1", "qa_2", "qa_3", "qa_4", "qa_5"];

export function ApplicationDraftsPanel({ drafts, opportunityId, returnTo, aiConfigured, resumeConfirmed }: {
  drafts: ApplicationDraft[];
  opportunityId: string;
  returnTo: string;
  aiConfigured: boolean;
  resumeConfirmed: boolean;
}) {
  const sorted = [...drafts].sort((a, b) => fieldOrder.indexOf(a.field_key) - fieldOrder.indexOf(b.field_key));
  const hasCoverLetter = drafts.some((draft) => draft.field_key === "cover_letter");
  const hidden = (name: string, value: string) => <input type="hidden" name={name} value={value} />;

  return (
    <section className="detail-panel">
      <div className="panel-heading"><div><p>Drafts · application_pack_v1</p><h3>申请材料草稿</h3></div><span className="muted-count">{drafts.length}</span></div>
      <p className="section-note">
        AI 只读取本岗位的 JD、投递包中确认的简历版本和你粘贴的问题，输出可编辑草稿；每条结论附依据，信息不足的段落标为“待确认”。你编辑过的段落会锁定，重新生成不会覆盖。系统不会提交或发送任何内容。
      </p>
      <form action={generateApplicationDrafts} className="draft-generate-form">
        {hidden("opportunityId", opportunityId)}{hidden("returnTo", returnTo)}
        <label><span>申请问题（可选，每行一个，最多 5 个）</span><textarea name="questions" rows={3} maxLength={2600} placeholder={"Why do you want to join us?\n介绍一个你主导的项目"} /></label>
        <SubmitButton className="primary-button" pendingLabel="正在生成草稿…" disabled={!aiConfigured || !resumeConfirmed}>生成 / 更新 AI 草稿</SubmitButton>
        {!aiConfigured ? <small>服务器尚未配置 AI；仍可在下方手写草稿。</small> : !resumeConfirmed ? <small>请先在投递包中确认本次使用的简历版本。</small> : <small>同样的 JD、简历与问题会直接复用已有结果，不重复计费；受每月 HK$100 上限约束。</small>}
      </form>

      {sorted.map((draft) => {
        const evidence = Array.isArray(draft.evidence) ? (draft.evidence as Evidence[]) : [];
        const missing = Array.isArray(draft.missing_info) ? (draft.missing_info as string[]) : [];
        return (
          <article key={draft.id} className={`draft-card${draft.needs_confirmation ? " needs-confirmation" : ""}`}>
            <div className="draft-card-head">
              <strong>{draftFieldLabel(draft.field_key, draft.question)}</strong>
              <span className="phase-badge">{draft.locked ? "已编辑 · 锁定" : draft.needs_confirmation ? "AI 草稿 · 待确认" : "AI 草稿"}</span>
            </div>
            <form action={saveApplicationDraft} className="draft-edit-form">
              {hidden("opportunityId", opportunityId)}{hidden("returnTo", returnTo)}{hidden("fieldKey", draft.field_key)}
              {hidden("baseVersion", String(draft.version))}{draft.question ? hidden("question", draft.question) : null}
              <textarea name="body" defaultValue={draft.body} rows={draft.field_key === "cover_letter" ? 10 : 5} maxLength={8000} aria-label={draftFieldLabel(draft.field_key, draft.question)} />
              <SubmitButton className="quiet-button" pendingLabel="正在保存…">保存并锁定</SubmitButton>
            </form>
            {missing.length ? <p className="draft-missing">缺少信息：{missing.join("；")}</p> : null}
            {evidence.length ? (
              <details className="draft-evidence">
                <summary>依据（{evidence.length}）</summary>
                <ul>{evidence.map((item, index) => <li key={index}>{item.claim} <small>— {item.source === "jd" ? "JD" : "简历"}：“{item.quote}”</small></li>)}</ul>
              </details>
            ) : draft.source === "ai" ? <p className="draft-missing">没有给出依据，请逐句核对。</p> : null}
            {draft.locked && draft.ai_analysis_id ? (
              <form action={unlockApplicationDraft}>
                {hidden("draftId", draft.id)}{hidden("returnTo", returnTo)}
                <SubmitButton className="quiet-button" pendingLabel="正在解锁…">允许下次生成覆盖</SubmitButton>
              </form>
            ) : null}
          </article>
        );
      })}

      {!hasCoverLetter ? (
        <form action={saveApplicationDraft} className="draft-edit-form">
          {hidden("opportunityId", opportunityId)}{hidden("returnTo", returnTo)}{hidden("fieldKey", "cover_letter")}
          <label><span>手写求职信（不使用 AI）</span><textarea name="body" rows={6} maxLength={8000} required /></label>
          <SubmitButton className="quiet-button" pendingLabel="正在保存…">保存求职信草稿</SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
