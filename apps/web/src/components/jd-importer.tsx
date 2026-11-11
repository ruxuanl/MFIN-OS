"use client";

import { useMemo, useState } from "react";

import { importOpportunityJd } from "@/app/(app)/workspace-actions";
import { SubmitButton } from "@/components/operation-feedback";
import { maxInternshipJdLength, parseInternshipJd } from "@/lib/internships/jd-parser";

const trackLabels = { internship: "实习", graduate: "秋招" } as const;

export function JdImporter({ track }: { track: "internship" | "graduate" }) {
  const label = trackLabels[track];
  const [rawJd, setRawJd] = useState("");
  const extraction = useMemo(() => parseInternshipJd(rawJd), [rawJd]);

  const hasInput = rawJd.trim().length > 0;
  const canSubmit = rawJd.trim().length >= 20;

  return (
    <section className="workspace-section jd-import-section">
      <div className="workspace-section-heading">
        <div><p>Quick capture</p><h2>粘贴 JD，自动建档</h2></div>
        <span className="phase-badge">本地规则 · 无需密钥</span>
      </div>
      <p className="section-note">整段复制即可。系统会提取核心属性并直接建立一条“{label}”长期记录；这是记录与追踪，不会替你投递。</p>
      <form action={importOpportunityJd} className="workspace-form jd-import-form">
        <input type="hidden" name="track" value={track} />
        <label className="jd-paste-field">
          <span>粘贴完整 JD</span>
          <textarea
            name="rawJd"
            value={rawJd}
            onChange={(event) => setRawJd(event.target.value)}
            rows={12}
            minLength={20}
            maxLength={maxInternshipJdLength}
            placeholder={'直接粘贴招聘信息，例如：\n公司：…\n岗位：…\n岗位职责：…\n任职要求：…\n截止日期：…'}
            required
          />
          <small>{rawJd.length.toLocaleString("zh-CN")} / {maxInternshipJdLength.toLocaleString("zh-CN")} 字符</small>
        </label>

        {hasInput ? <div key={rawJd}>
          <div className="jd-extraction-summary" aria-live="polite">
            <div><span>识别置信度</span><strong>{Math.round(extraction.confidence * 100)}%</strong></div>
            <div><span>岗位职责</span><strong>{extraction.responsibilities ? "已识别" : "待核对"}</strong></div>
            <div><span>岗位要求</span><strong>{extraction.requirements ? "已识别" : "待核对"}</strong></div>
            <div><span>来源链接</span><strong>{extraction.sourceUrl ? "已识别" : "未提供"}</strong></div>
          </div>
          {extraction.gaps.length ? <p className="jd-gap-note">待核对：{extraction.gaps.join("、")}。系统不会补猜；公司和岗位可在下方直接修正。</p> : null}

          <div className="field-grid jd-confirm-grid">
            <label><span>公司 *</span><input name="company" defaultValue={extraction.company ?? ""} maxLength={240} required /></label>
            <label><span>岗位 *</span><input name="roleTitle" defaultValue={extraction.roleTitle ?? ""} maxLength={240} required /></label>
            <label><span>部门</span><input name="department" defaultValue={extraction.department ?? ""} maxLength={240} /></label>
            <label><span>地点</span><input name="location" defaultValue={extraction.location ?? ""} maxLength={240} /></label>
            <label><span>JD 发布时间</span><input name="postedOn" type="date" defaultValue={extraction.postedOn ?? ""} /></label>
            <label><span>截止日期</span><input name="deadline" type="date" defaultValue={extraction.deadline ?? ""} /></label>
            <label><span>当前状态</span><select name="stage" defaultValue="evaluation"><option value="evaluation">评估中</option><option value="preparation">准备申请</option><option value="submitted">已投递</option></select></label>
            <label><span>投递日期（已投递时）</span><input name="appliedAt" type="date" /></label>
          </div>
          <input type="hidden" name="sourceUrl" value={extraction.sourceUrl ?? ""} />
        </div> : null}

        <SubmitButton className="primary-button" disabled={!canSubmit} pendingLabel="正在识别并写入…">识别并保存到{label}表</SubmitButton>
      </form>
    </section>
  );
}
