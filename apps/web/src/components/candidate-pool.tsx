"use client";

import { useActionState, useOptimistic, useState } from "react";

import { batchDecideCandidates, promoteCandidate } from "@/app/(app)/workspace-actions";
import { SubmitButton } from "@/components/operation-feedback";
import { errorLabel, initialBatchState } from "@/lib/candidates/batch";
import { candidatePresentation } from "@/lib/candidates/presentation";

export type CandidateCard = {
  id: string;
  company: string;
  role_title: string;
  location: string | null;
  source_summary: string | null;
  source_url?: string | null;
  decision_status: string;
};

const decisionLabels = { track: "批量追踪", apply: "批量准备申请", later: "稍后处理", dismissed: "不考虑" } as const;

export function CandidatePool({ track, candidates }: { track: "internship" | "graduate"; candidates: CandidateCard[] }) {
  const formId = `candidate-batch-${track}`;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<keyof typeof decisionLabels>("later");
  const [state, formAction] = useActionState(batchDecideCandidates, initialBatchState);
  // Optimistic: selected cards dim as "处理中" while the server runs; React drops this state when the
  // action settles, so failed items simply reappear from the server-rendered list (rollback).
  const [pending, markPending] = useOptimistic<Set<string>, string[]>(new Set(), (current, ids) => new Set([...current, ...ids]));
  const failures = new Map(state.results.filter((item) => item.outcome === "failed").map((item) => [item.candidateId, item.errorCode]));

  const toggle = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = candidates.length > 0 && candidates.every((candidate) => selected.has(candidate.id));

  return (
    <>
      <form
        id={formId}
        className="candidate-batch-bar"
        action={(formData) => {
          const ids = formData.getAll("candidateIds").map(String);
          markPending(ids);
          setSelected(new Set());
          formAction(formData);
        }}
      >
        <input type="hidden" name="track" value={track} />
        <label className="candidate-select-all">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(candidates.map((candidate) => candidate.id)))}
            disabled={candidates.length === 0}
          />
          全选（已选 {selected.size}）
        </label>
        <select name="decision" value={decision} onChange={(event) => setDecision(event.target.value as keyof typeof decisionLabels)}>
          {Object.entries(decisionLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <input name="reason" maxLength={1000} placeholder={decision === "dismissed" ? "原因（必填）" : "原因（可选）"} required={decision === "dismissed"} />
        <SubmitButton className="quiet-button" pendingLabel="正在批量处理…" disabled={selected.size === 0}>应用到所选</SubmitButton>
      </form>
      {state.message ? <p className={state.status === "error" ? "workspace-notice notice-error" : "workspace-notice"} role="status">{state.message}</p> : null}
      {failures.size > 0 ? (
        <ul className="candidate-batch-failures">
          {state.results.filter((item) => item.outcome === "failed").map((item) => {
            const candidate = candidates.find((entry) => entry.id === item.candidateId);
            return <li key={item.candidateId}>{candidate ? `${candidate.company} · ${candidate.role_title}` : "已不在列表中的候选"}：{errorLabel(item.errorCode)}</li>;
          })}
        </ul>
      ) : null}

      {candidates.length === 0 ? (
        <p className="workspace-empty">尚无候选。M3 不会用假岗位填充，也不会自动把岗位塞进长期表。</p>
      ) : (
        <div className="candidate-grid">
          {candidates.map((candidate) => {
            const display = candidatePresentation(candidate);
            return (
            <article
              className={`candidate-card${pending.has(candidate.id) ? " is-pending" : ""}${failures.has(candidate.id) ? " has-error" : ""}`}
              key={candidate.id}
              aria-busy={pending.has(candidate.id) || undefined}
            >
              <label className="candidate-select">
                <input type="checkbox" form={formId} name="candidateIds" value={candidate.id} checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                <span>选择</span>
              </label>
              <div className="candidate-info-block candidate-basics">
                <div className="candidate-title-line"><h3>{display.company}</h3><p>{display.role}</p></div>
                <div className="candidate-facts"><span>{display.date ? `来源发布 ${display.date}` : "发布日期待确认"}</span><span>{display.location}</span>{candidate.decision_status === "later" ? <span>稍后处理</span> : null}{pending.has(candidate.id) ? <span role="status">处理中…</span> : null}</div>
              </div>
              <div className="candidate-info-block candidate-apply"><span className="candidate-block-label">投递方式</span><div>{display.emails.map(email => <a key={email} href={`mailto:${email}`}>{email}</a>)}{display.urls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer">{display.emails.length ? "补充网页" : "打开招聘网页"}{display.urls.length > 1 ? ` ${index + 1}` : ""}<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 19 19 5M5 5h14v14"/></svg></a>)}{display.applicationNote ? <p>{display.applicationNote}</p> : null}</div></div>
              <div className="candidate-info-block candidate-jd"><span className="candidate-block-label">JD · 招聘详情</span><p>{display.jd}</p></div>
              <div className="candidate-actions">
                <form action={promoteCandidate}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="track" value={track} />
                  <input type="hidden" name="intent" value="track" />
                  <SubmitButton className="quiet-button" pendingLabel="正在加入…">追踪</SubmitButton>
                </form>
                <form action={promoteCandidate}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="track" value={track} />
                  <input type="hidden" name="intent" value="apply" />
                  <SubmitButton className="primary-button" pendingLabel="正在加入…">准备申请</SubmitButton>
                </form>
              </div>
              <p className="boundary-caption">“准备申请”只进入准备阶段；系统不会投递或提交。</p>
            </article>
          );})}
        </div>
      )}
    </>
  );
}
