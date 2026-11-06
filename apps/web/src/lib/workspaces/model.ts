export const opportunityStages = [
  "new",
  "evaluation",
  "preparation",
  "submitted",
  "test",
  "interview",
  "waiting",
  "offer",
  "ended"
] as const;

export type OpportunityStage = (typeof opportunityStages)[number];
export type WorkspaceObjectType = "opportunity" | "course" | "action";

export const stageLabels: Record<OpportunityStage, string> = {
  new: "新发现",
  evaluation: "评估",
  preparation: "准备",
  submitted: "已投递",
  test: "测试",
  interview: "面试",
  waiting: "等待",
  offer: "Offer",
  ended: "结束"
};

export type MutationResult = {
  status: "applied" | "partial" | "conflict";
  newVersion: number;
  appliedFields: string[];
  conflictCount: number;
};

export type PendingMutation = {
  id: string;
  deviceId: string;
  objectType: WorkspaceObjectType;
  objectId: string;
  baseVersion: number;
  baseValues: Record<string, unknown>;
  patch: Record<string, unknown>;
  createdAt: string;
};

export function getMutationOutcomeLabel(result: MutationResult) {
  if (result.status === "conflict") return "发现同字段冲突，请选择保留版本";
  if (result.status === "partial") return "未冲突字段已同步，其余字段等待处理";
  return "已安全同步";
}
export function normalizeFormPatch(
  values: Record<string, FormDataEntryValue>,
  nullableFields: ReadonlySet<string> = new Set()
) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => {
      const text = String(value).trim();
      return [key, text === "" && nullableFields.has(key) ? null : text];
    })
  );
}
