import { isResumeWorkspaceEnabled } from "@/lib/config";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationPackagePanel } from "@/components/application-package-panel";
import { ApplicationSubmissionPanel } from "@/components/application-submission-panel";
import { PageHeader } from "@/components/page-header";
import { OpportunityAiPanel } from "@/components/opportunity-ai-panel";
import { WorkspaceMutationForm, type MutationField } from "@/components/workspace-mutation-form";
import { WorkspaceNotice } from "@/components/workspace-notice";
import { ActionPanel, ConflictPanel, CustomFieldsPanel, TimelinePanel } from "@/components/workspace-detail-panels";
import { getApplicationPackage, getApplicationSnapshots } from "@/lib/applications/data";
import { requireUser } from "@/lib/auth/session";
import { getOpportunityResumeContext } from "@/lib/resumes/data";
import { getOpportunityDetail } from "@/lib/workspaces/data";
import { opportunityStages, stageLabels } from "@/lib/workspaces/model";

export async function OpportunityDetail({
  id,
  track,
  notice
}: {
  id: string;
  track: "internship" | "graduate";
  notice?: string;
}) {
  const user = await requireUser();
  // One parallel batch: the detail, resume context, package and snapshots are all
  // owner-scoped by RLS, so loading them before the not-found check is safe.
  const [data, resumeContext, packageView, snapshots] = await Promise.all([
    getOpportunityDetail(user, id, track),
    track === "internship" && isResumeWorkspaceEnabled() ? getOpportunityResumeContext(user, id) : Promise.resolve(null),
    getApplicationPackage(user, id),
    getApplicationSnapshots(user, id)
  ]);
  if (!data) notFound();
  const item = data.opportunity;
  const basePath = track === "internship" ? "/internships" : "/graduate";
  const returnTo = `${basePath}/${id}`;
  const locked = new Set(data.locks.map((lock) => lock.field_path));
  const lock = (field: MutationField) => ({ ...field, locked: locked.has(field.name) });
  const fields: MutationField[] = [
    lock({ name: "company", label: "公司" }),
    lock({ name: "role_title", label: "岗位" }),
    lock({ name: "department", label: "部门", nullable: true }),
    lock({ name: "location", label: "地点", nullable: true }),
    ...(track === "graduate"
      ? [lock({ name: "work_mode", label: "工作形式", type: "select", nullable: true, options: [
        { value: "unspecified", label: "未说明" }, { value: "onsite", label: "线下" },
        { value: "hybrid", label: "混合" }, { value: "remote", label: "远程" }
      ] })]
      : []),
    lock({ name: "deadline", label: "截止日期", type: "date", nullable: true }),
    lock({ name: "main_stage", label: "主阶段", type: "select", options: opportunityStages.map((stage) => ({ value: stage, label: stageLabels[stage] })) }),
    lock({ name: "substage", label: "子阶段", nullable: true }),
    lock({ name: "close_reason", label: "结束原因", type: "select", nullable: true, options: [
      { value: "rejected", label: "被拒" }, { value: "withdrawn", label: "主动放弃" },
      { value: "closed", label: "岗位关闭" }, { value: "ineligible", label: "资格不符" }, { value: "expired", label: "已过期" }
    ] }),
    lock({ name: "applied_at", label: "投递时间", type: "datetime-local", nullable: true }),
    lock({ name: "waiting_on", label: "等待方", type: "select", nullable: true, options: [
      { value: "user", label: "等待用户" }, { value: "other_party", label: "等待对方" },
      { value: "none", label: "无需等待" }, { value: "insufficient_information", label: "信息不足" }
    ] }),
    lock({ name: "record_state", label: "记录状态", type: "select", options: [
      { value: "active", label: "进行中" }, { value: "archived", label: "已归档" }
    ] })
  ];

  return (
    <div className="page-shell detail-page">
      <Link className="back-link" href={basePath}>← 返回{track === "internship" ? "实习" : "秋招"}表</Link>
      <PageHeader
        eyebrow={`${track === "internship" ? "Internship" : "Graduate"} · v${item.version}`}
        title={item.company}
        description={`${item.role_title}${item.location ? ` · ${item.location}` : ""}`}
        action={<span className={`stage-pill stage-${item.main_stage}`}>{stageLabels[item.main_stage as keyof typeof stageLabels] ?? item.main_stage}</span>}
      />
      <WorkspaceNotice notice={notice} />
      {resumeContext ? <OpportunityAiPanel opportunityId={id} notice={notice} data={resumeContext} /> : null}
      <ConflictPanel conflicts={data.conflicts} returnTo={returnTo} />
      <div className="detail-grid">
        <section className="detail-panel detail-main">
          <div className="panel-heading"><div><p>Current projection</p><h3>核心字段</h3></div><span className="lock-count">{locked.size} 个字段锁</span></div>
          <WorkspaceMutationForm objectType="opportunity" objectId={item.id} version={item.version} initialValues={item} fields={fields} />
        </section>
        {item.raw_jd ? <section className="detail-panel jd-detail-panel">
          <div className="panel-heading">
            <div><p>JD evidence</p><h3>岗位职责与要求</h3></div>
            <span className="muted-count">{item.extraction_confidence === null ? "—" : `${Math.round(item.extraction_confidence * 100)}%`}</span>
          </div>
          {item.extraction_gaps.length ? <p className="jd-gap-note">待核对字段：{item.extraction_gaps.join("、")}</p> : <p className="jd-complete-note">核心字段已从原文中识别；仍可在上方手动修正并锁定。</p>}
          <div className="jd-structured-copy">
            <div><span>岗位职责</span><p>{item.responsibilities || "原文未形成明确的职责分段。"}</p></div>
            <div><span>岗位要求</span><p>{item.requirements || "原文未形成明确的要求分段。"}</p></div>
            {item.application_method ? <div><span>投递 / 申请方式</span><p>{item.application_method}</p></div> : null}
          </div>
          <div className="jd-source-row">
            <small>{item.parser_version ?? "unknown_parser"} · {item.posted_on ? `发布于 ${item.posted_on} · ` : ""}确定性规则，非 AI</small>
            {item.source_url ? <a className="quiet-link" href={item.source_url} target="_blank" rel="noreferrer">打开来源 ↗</a> : null}
          </div>
          <details className="raw-jd-details">
            <summary>查看粘贴的原始 JD</summary>
            <pre>{item.raw_jd}</pre>
          </details>
        </section> : null}
        <ApplicationPackagePanel view={packageView} opportunityId={item.id} returnTo={returnTo} deadline={item.deadline} />
        <ApplicationSubmissionPanel snapshots={snapshots} opportunityId={item.id} mainStage={item.main_stage} returnTo={returnTo} />
        <ActionPanel actions={data.actions} dependencies={data.dependencies} contextType="opportunity" contextId={item.id} track={track} returnTo={returnTo} />
        <CustomFieldsPanel definitions={data.customFields} values={data.customValues} scope={track} entityType="opportunity" entityId={item.id} returnTo={returnTo} />
        <TimelinePanel timeline={data.timeline} />
      </div>
    </div>
  );
}
