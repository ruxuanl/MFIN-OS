"use client";

import { useActionState, useOptimistic, useState } from "react";

import { batchDecideCandidates, promoteCandidate } from "@/app/(app)/workspace-actions";
import { SubmitButton } from "@/components/operation-feedback";
import { errorLabel, initialBatchState } from "@/lib/candidates/batch";

export type CandidateCard = {
  id: string;
  company: string;
  role_title: string;
  location: string | null;
  source_summary: string | null;
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
          {candidates.map((candidate) => (
            <article
              className={`candidate-card${pending.has(candidate.id) ? " is-pending" : ""}${failures.has(candidate.id) ? " has-error" : ""}`}
              key={candidate.id}
              aria-busy={pending.has(candidate.id) || undefined}
            >
              <label className="candidate-select">
                <input type="checkbox" form={formId} name="candidateIds" value={candidate.id} checked={selected.has(candidate.id)} onChange={() => toggle(candidate.id)} />
                <span>选择</span>
              </label>
              <div>
                <span>{candidate.location || "地点待确认"}{candidate.decision_status === "later" ? " · 稍后" : ""}{pending.has(candidate.id) ? " · 处理中…" : ""}</span>
                <h3>{candidate.company}</h3>
                <p>{candidate.role_title}</p>
              </div>
              {candidate.source_summary ? <small>{candidate.source_summary}</small> : null}
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
          ))}
        </div>
      )}
    </>
  );
}
