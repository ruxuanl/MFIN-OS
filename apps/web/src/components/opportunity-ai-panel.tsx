import { analyzeOpportunityJd, assignOpportunityResume } from "@/app/(app)/materials/actions";
import { AutoAnalyzeOpportunity } from "@/components/auto-analyze-opportunity";
import { SubmitButton } from "@/components/operation-feedback";
import { getAiProviderLabel } from "@/lib/config";
import type { getOpportunityResumeContext } from "@/lib/resumes/data";
import type { Json } from "@/lib/supabase/database.types";

type ResumeContext = Awaited<ReturnType<typeof getOpportunityResumeContext>>;

function record(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined> : {};
}

function strings(result: Record<string, Json | undefined>, key: string) {
  const value = result[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function recommendations(result: Record<string, Json | undefined>) {
  const value = result.resumeTailoring;
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, Json | undefined>;
    return typeof row.change === "string" ? [{
      priority: typeof row.priority === "string" ? row.priority : "medium",
      change: row.change,
      evidence: typeof row.evidence === "string" ? row.evidence : ""
    }] : [];
  });
}

function score(result: Record<string, Json | undefined>, key: string) {
  return typeof result[key] === "number" ? result[key] : "—";
}

function PanelBody({ opportunityId, returnTo, data, autoStart = false }: {
  opportunityId: string;
  returnTo: string;
  data: ResumeContext;
  autoStart?: boolean;
}) {
  const current = data.versions.find((version) => version.id === data.currentAssignment?.resume_version_id);
  const defaultMaster = data.versions.find((version) => version.document?.document_kind === "master");
  const selected = current ?? defaultMaster;
  const analysis = data.analyses.find((item) => item.resume_version_id === selected?.id);
  const result = analysis ? record(analysis.result) : null;
  return <>
    <div className="ai-panel-heading">
      <div><p>AI application brief</p><h2>JD 凝练与投递决策</h2></div>
      <span className="phase-badge">只生成建议与草稿</span>
    </div>
    <p className="section-note">系统会把这一条 JD 与下方选中的简历发送给 {getAiProviderLabel()}。不会修改文件、发送邮件或提交申请。</p>
    {data.versions.length ? <div className="ai-resume-selector">
      <form action={assignOpportunityResume}>
        <input type="hidden" name="opportunityId" value={opportunityId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <label><span>本岗位使用的简历版本</span><select name="resumeVersionId" defaultValue={selected?.id ?? ""}>
          {data.versions.map((version) => <option key={version.id} value={version.id}>
            {version.document?.label ?? "简历"} · v{version.version_number}{version.document?.document_kind === "master" ? "（默认通用版）" : "（岗位版）"}
          </option>)}
        </select></label>
        <SubmitButton pendingLabel="正在绑定…">保存岗位版本</SubmitButton>
      </form>
      {selected ? <a className="quiet-link" href={`/api/materials/resume/${selected.id}`} target="_blank" rel="noreferrer">打开当前简历 ↗</a> : null}
    </div> : <div className="ai-empty-resume"><p>先上传一份通用 Master 简历，系统才能做真实匹配。</p><a className="primary-button" href="/materials">去上传简历</a></div>}
    {selected && autoStart ? <AutoAnalyzeOpportunity opportunityId={opportunityId} /> : null}
    {selected && !autoStart ? <form action={analyzeOpportunityJd} className="ai-run-form">
      <input type="hidden" name="opportunityId" value={opportunityId} />
      <SubmitButton className="primary-button" pendingLabel="正在凝练 JD 并匹配简历…">{analysis ? "按当前 JD / 简历检查缓存" : "开始 AI 分析"}</SubmitButton>
      <small>同一 JD＋同一简历版本会复用缓存，不重复计费。</small>
    </form> : null}

    {result ? <div className="jd-ai-result">
      <div className="analysis-score-grid analysis-score-grid-wide">
        <div><span>资格</span><strong>{score(result, "qualificationScore")}</strong></div>
        <div><span>匹配</span><strong>{score(result, "matchScore")}</strong></div>
        <div><span>投递推荐</span><strong>{score(result, "recommendationIndex")}</strong></div>
        <div><span>紧急度</span><strong>{score(result, "urgencyScore")}</strong></div>
      </div>
      <div className="ai-summary-block"><span>一句话判断</span><p>{typeof result.summary === "string" ? result.summary : ""}</p></div>
      <div className="jd-ai-columns">
        <div><h3>JD 重点</h3><ul>{strings(result, "keyResponsibilities").map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3>匹配证据</h3><ul>{strings(result, "matchedEvidence").map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h3>缺口与风险</h3><ul>{strings(result, "gapsAndRisks").map((item) => <li key={item}>{item}</li>)}</ul></div>
      </div>
      <div className="ai-summary-block"><span>紧急度</span><p>{typeof result.urgencyReason === "string" ? result.urgencyReason : ""}</p></div>
      <div className="tailoring-list"><h3>简历针对性修改建议</h3>{recommendations(result).map((item, index) => <article key={`${item.change}-${index}`}><span>{item.priority}</span><div><strong>{item.change}</strong><p>{item.evidence}</p></div></article>)}</div>
      <div className="email-draft-card"><div><span>可编辑求职邮件草稿</span><strong>{typeof result.emailSubject === "string" ? result.emailSubject : ""}</strong></div><pre>{typeof result.emailBody === "string" ? result.emailBody : ""}</pre><small>仅供复制和修改；系统没有发送能力。</small></div>
    </div> : null}
  </>;
}

export function OpportunityAiPanel({ opportunityId, notice, data }: {
  opportunityId: string;
  notice?: string;
  data: ResumeContext;
}) {
  const returnTo = `/internships/${opportunityId}`;
  const popupNotices = new Set(["jd_imported", "jd_duplicate", "ai_completed", "ai_cached", "ai_not_configured", "master_resume_required", "ai_permission_required"]);
  if (notice && popupNotices.has(notice)) {
    return <dialog className="ai-analysis-dialog" open>
      <form method="dialog" className="dialog-close-form"><SubmitButton aria-label="关闭 AI 分析面板" pendingLabel="关闭中…">×</SubmitButton></form>
      <PanelBody opportunityId={opportunityId} returnTo={returnTo} data={data} autoStart={notice === "jd_imported" || notice === "jd_duplicate"} />
    </dialog>;
  }
  return <section className="detail-panel ai-analysis-panel"><PanelBody opportunityId={opportunityId} returnTo={returnTo} data={data} /></section>;
}
