// Pure helpers for candidate batch triage (#18). No server imports, so vitest can load it.
export const candidateDecisions = ["track", "apply", "later", "dismissed"] as const;
export type CandidateDecision = (typeof candidateDecisions)[number];

export const maxBatchSize = 100;

export type BatchItemResult = {
  candidateId: string;
  outcome: "promoted" | "updated" | "unchanged" | "failed";
  errorCode: string | null;
};

export type BatchState = {
  status: "idle" | "done" | "error";
  message?: string;
  results: BatchItemResult[];
};

export const initialBatchState: BatchState = { status: "idle", results: [] };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ParsedBatch =
  | { ok: true; ids: string[]; decision: CandidateDecision; reason: string | null }
  | { ok: false; message: string };

export function parseBatchForm(values: { ids: unknown[]; decision: unknown; reason: unknown }): ParsedBatch {
  const ids = [...new Set(values.ids.map((value) => String(value)).filter((value) => uuidPattern.test(value)))];
  const decision = String(values.decision ?? "");
  const reason = String(values.reason ?? "").trim() || null;
  if (ids.length === 0) return { ok: false, message: "请至少选择一个候选。" };
  if (ids.length > maxBatchSize) return { ok: false, message: `一次最多处理 ${maxBatchSize} 个候选。` };
  if (!(candidateDecisions as readonly string[]).includes(decision)) return { ok: false, message: "请选择批量操作。" };
  if (reason && reason.length > 1000) return { ok: false, message: "原因不能超过 1000 字。" };
  if (decision === "dismissed" && !reason) return { ok: false, message: "标记为不考虑时需要填写原因。" };
  return { ok: true, ids, decision: decision as CandidateDecision, reason };
}

const errorLabels: Record<string, string> = {
  candidate_not_found: "候选不存在或已被删除",
  candidate_already_promoted: "已进入长期表，不能再改为稍后或不考虑",
  dismissed_candidate_cannot_be_promoted: "已标记不考虑，需先改为稍后再追踪",
  privacy_locked: "隐私锁已开启"
};

export function errorLabel(code: string | null) {
  return (code && errorLabels[code]) || "处理失败，请刷新后重试";
}

export function summarize(results: BatchItemResult[]) {
  const failed = results.filter((item) => item.outcome === "failed").length;
  const unchanged = results.filter((item) => item.outcome === "unchanged").length;
  const done = results.length - failed - unchanged;
  return [`完成 ${done} 项`, unchanged ? `${unchanged} 项无需变更` : null, failed ? `${failed} 项失败` : null]
    .filter(Boolean).join("，") + "。";
}
