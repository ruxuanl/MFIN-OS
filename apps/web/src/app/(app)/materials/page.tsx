import { getAiProvider, getAiProviderLabel, isResumeWorkspaceEnabled } from "@/lib/config";
import Link from "next/link";

import { analyzeResumeVersion, uploadResume } from "@/app/(app)/materials/actions";
import { AutoAnalyzeResume } from "@/components/auto-analyze-resume";
import { SubmitButton } from "@/components/operation-feedback";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth/session";
import { getResumeLibrary } from "@/lib/resumes/data";
import type { Json } from "@/lib/supabase/database.types";

export const metadata = { title: "材料" };

const notices: Record<string, string> = {
  resume_uploaded: "简历已私密保存为新版本。原有版本没有被覆盖。",
  resume_duplicate: "这份文件已存在，未创建重复版本。",
  files_permission_required: "请先到状态中心开启“文件上传”权限；隐私锁开启时无法上传。",
  master_exists: "已经有一个 Master 简历。请选择该文档以新增版本，或上传岗位定制版。",
  upload_invalid: "上传信息不完整；请检查名称、类型和文件。",
  upload_failed: "上传未完成，未成功登记的对象已清理。",
  resume_empty: "文件为空。",
  resume_too_large: "文件超过 10 MB。",
  resume_unsupported_type: "只支持 PDF 或 DOCX。",
  resume_type_mismatch: "文件内容与扩展类型不一致。",
  resume_encrypted: "暂不处理加密简历。",
  resume_too_complex: "文件页数或结构超过安全处理上限。",
  resume_no_text: "没有识别到足够文字；扫描版请先转换为可搜索 PDF。",
  resume_extract_failed: "无法安全读取这份文件。",
  ai_not_configured: "AI 尚未配置完整，请检查所选服务的密钥、模型和计费参数。",
  ai_permission_required: "请先开启 AI 总开关、AI 分析和简历分析权限。",
  ai_budget_exceeded: "本月 HK$100 AI 硬上限已阻止这次调用。",
  ai_failed: "AI 分析未完成；文件仍安全保存在简历库中。",
  ai_usage_unsettled: "本次 AI 调用的计费尚未确认，已保留预算，请勿连续重试。文件仍安全保存在简历库中。",
  ai_completed: "AI 分析已完成并归档。",
  ai_cached: "相同简历已有同版本分析，已直接复用。"
};

function record(value: Json) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json | undefined> : {};
}

function score(result: Record<string, Json | undefined>, key: string) {
  return typeof result[key] === "number" ? result[key] : "—";
}

function strings(result: Record<string, Json | undefined>, key: string) {
  const value = result[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export default async function MaterialsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!isResumeWorkspaceEnabled()) return <div className="page-shell materials-page"><PageHeader eyebrow="Artifact library" title="材料" description="简历版本库与 AI 分析仍在测试验收，当前未启用。已有岗位和 JD 建档可继续使用。" /><Link className="quiet-link" href="/internships">返回实习工作区 →</Link></div>;
  const data = await getResumeLibrary(user);
  const params = await searchParams;
  const noticeCode = typeof params.notice === "string" ? params.notice : null;
  const notice = noticeCode ? notices[noticeCode] : null;
  const uploadedVersionId = typeof params.version === "string" ? params.version : null;
  const master = data.documents.find((document) => document.document_kind === "master");
  const latestAnalysisByVersion = new Map<string, (typeof data.analyses)[number]>();
  for (const analysis of data.analyses) {
    if (!latestAnalysisByVersion.has(analysis.resume_version_id)) {
      latestAnalysisByVersion.set(analysis.resume_version_id, analysis);
    }
  }
  const shouldAutoAnalyze = Boolean(uploadedVersionId && data.aiConfigured
    && noticeCode === "resume_uploaded"
    && data.documents.some((document) => document.versions.some((version) => version.id === uploadedVersionId)));

  return <div className="page-shell materials-page">
    <PageHeader
      eyebrow="Artifact library"
      title="简历与申请材料"
      description="Master 原件与每个岗位版本分开保存；AI 只提出建议，不覆盖文件，也不发送邮件。"
      action={<span className="phase-badge">私有存储 · 版本不可变</span>}
    />
    {notice ? <p className="workspace-notice" role="status">{notice}</p> : null}
    {shouldAutoAnalyze && uploadedVersionId ? <AutoAnalyzeResume resumeVersionId={uploadedVersionId} /> : null}

    <section className="workspace-section resume-upload-card">
      <div className="workspace-section-heading">
        <div><p>Private intake</p><h2>上传一个新版本</h2></div>
        <span className="muted-count">PDF / DOCX · 10 MB</span>
      </div>
      <p className="section-note">{getAiProvider() === "deepseek" ? "DeepSeek 使用 PDF / DOCX 提取的文字分析内容、结构和 ATS，不评估视觉排版。" : "PDF 会做内容与视觉排版分析；DOCX 首版做内容、结构和 ATS 分析。"}文件原件保存在私有 Supabase Storage；AI 仅接收当前选中的材料内容。</p>
      <form action={uploadResume} className="workspace-form resume-upload-form">
        <label><span>材料名称</span><input name="label" defaultValue={master?.label ?? "通用 Master 简历"} maxLength={160} required /></label>
        <label><span>材料类型</span><select name="documentKind" defaultValue={master ? "tailored" : "master"}>
          <option value="master">通用 Master</option><option value="tailored">岗位定制版</option>
        </select></label>
        <label><span>归入现有材料（可选）</span><select name="documentId" defaultValue="">
          <option value="">创建新材料</option>
          {data.documents.map((document) => <option key={document.id} value={document.id}>{document.label} · {document.document_kind === "master" ? "Master" : "定制"}</option>)}
        </select></label>
        <label><span>基于版本（可选）</span><select name="sourceVersionId" defaultValue="">
          <option value="">无 / 独立上传</option>
          {data.documents.flatMap((document) => document.versions.map((version) =>
            <option key={version.id} value={version.id}>{document.label} · v{version.version_number}</option>))}
        </select></label>
        <label className="field-wide"><span>选择文件</span><input name="resumeFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" required /></label>
        <SubmitButton className="primary-button" pendingLabel="正在校验并私密保存…">保存为新版本</SubmitButton>
      </form>
    </section>

    <div className="resume-budget-strip">
      <div><span>本月 AI 已用 / 已预留</span><strong>HK${(data.monthlyHkdCents / 100).toFixed(2)} / 100.00</strong></div>
      <div><span>{getAiProviderLabel()} 连接</span><strong>{data.aiConfigured ? "服务器已配置" : "等待 API Key"}</strong></div>
      <Link className="quiet-link" href="/status">查看权限中心 →</Link>
    </div>

    <section className="workspace-section">
      <div className="workspace-section-heading"><div><p>Version archive</p><h2>简历版本库</h2></div><span className="muted-count">{data.documents.reduce((count, item) => count + item.versions.length, 0)} 个版本</span></div>
      {data.documents.length ? <div className="resume-document-list">{data.documents.map((document) =>
        <article className="resume-document-card" key={document.id}>
          <div className="resume-document-heading"><div><p>{document.document_kind === "master" ? "MASTER · 只读原件" : "TAILORED · 岗位派生"}</p><h3>{document.label}</h3></div><span>{document.versions.length} 版</span></div>
          <div className="resume-version-list">{document.versions.map((version) => {
            const analysis = latestAnalysisByVersion.get(version.id);
            const result = analysis ? record(analysis.result) : null;
            return <div className="resume-version-row" key={version.id}>
              <div><strong>v{version.version_number} · {version.original_filename}</strong><small>{new Date(version.created_at).toLocaleString("zh-CN")} · {(version.size_bytes / 1024).toFixed(0)} KB{version.page_count ? ` · ${version.page_count} 页` : " · DOCX 内容模式"}</small></div>
              <div className="resume-version-actions">
                <a className="quiet-button" href={`/api/materials/resume/${version.id}`} target="_blank" rel="noreferrer">打开文件 ↗</a>
                <form action={analyzeResumeVersion}><input type="hidden" name="resumeVersionId" value={version.id} /><SubmitButton pendingLabel="分析中…">{analysis ? "查看 / 复用分析" : "AI 分析"}</SubmitButton></form>
              </div>
              {result ? <div className="resume-analysis-card">
                <div className="analysis-score-grid">
                  <div><span>总分</span><strong>{score(result, "overallScore")}</strong></div>
                  <div><span>排版</span><strong>{result.layoutScope === "content_only" ? "未评估" : score(result, "layoutScore")}</strong></div>
                  <div><span>内容</span><strong>{score(result, "contentScore")}</strong></div>
                  <div><span>ATS</span><strong>{score(result, "atsScore")}</strong></div>
                </div>
                <p>{typeof result.summary === "string" ? result.summary : ""}</p>
                {strings(result, "strengths").length ? <div><strong>优势</strong><ul>{strings(result, "strengths").map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
                {strings(result, "risks").length ? <div><strong>优先修改</strong><ul>{strings(result, "risks").map((item) => <li key={item}>{item}</li>)}</ul></div> : null}
              </div> : null}
            </div>;
          })}</div>
        </article>)}</div> : <p className="empty-inline">还没有简历。先上传通用 Master；之后每次修改都保存成新版本。</p>}
    </section>
  </div>;
}
