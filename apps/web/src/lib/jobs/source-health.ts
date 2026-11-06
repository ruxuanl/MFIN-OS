export type JobSourceSnapshot = {
  approvalStatus: string;
  enabled: boolean;
  healthStatus: string;
  pollingIntervalMinutes: number;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  coverageGap: string | null;
};

export type JobSourceCoverage = {
  kind: "unconfigured" | "awaiting_approval" | "paused" | "pending" | "healthy" | "partial" | "failed" | "stale";
  label: string;
  detail: string;
  hasCoverage: boolean;
  approvedCount: number;
  enabledCount: number;
  healthyCount: number;
};

function isFresh(source: JobSourceSnapshot, now: Date) {
  if (!source.lastSuccessAt || !source.lastVerifiedAt) return false;
  const verifiedAt = new Date(source.lastVerifiedAt).getTime();
  if (!Number.isFinite(verifiedAt)) return false;
  const freshnessWindowMinutes = Math.max(source.pollingIntervalMinutes * 2, 360);
  return now.getTime() - verifiedAt <= freshnessWindowMinutes * 60_000;
}
export function deriveJobSourceCoverage(
  sources: JobSourceSnapshot[],
  now = new Date()
): JobSourceCoverage {
  if (sources.length === 0) {
    return {
      kind: "unconfigured",
      label: "尚未配置公开来源",
      detail: "岗位发现 V0 控制面已就绪；在你确认来源清单前不会抓取任何网站。",
      hasCoverage: false,
      approvedCount: 0,
      enabledCount: 0,
      healthyCount: 0
    };
  }

  const approved = sources.filter((source) => source.approvalStatus === "approved");
  const enabled = approved.filter((source) => source.enabled);
  const healthy = enabled.filter((source) => source.healthStatus === "healthy" && isFresh(source, now));
  const failed = enabled.filter((source) => source.healthStatus === "failed");
  const degraded = enabled.filter((source) => source.healthStatus === "degraded");
  const stale = enabled.filter((source) => source.lastSuccessAt && !isFresh(source, now));

  const base = {
    approvedCount: approved.length,
    enabledCount: enabled.length,
    healthyCount: healthy.length
  };

  if (approved.length === 0) {
    return {
      ...base,
      kind: "awaiting_approval",
      label: "来源待你审批",
      detail: `${sources.length} 个建议来源保持关闭；未审批来源不会运行。`,
      hasCoverage: false
    };
  }
  if (enabled.length === 0) {
    return {
      ...base,
      kind: "paused",
      label: "已批准但未启用",
      detail: `${approved.length} 个来源已批准，当前均未运行；不会把停用冒充为“没有新岗位”。`,
      hasCoverage: false
    };
  }
  if (failed.length > 0) {
    return {
      ...base,
      kind: "failed",
      label: "来源运行失败",
      detail: `${failed.length}/${enabled.length} 个启用来源失败；状态中心保留错误码与覆盖缺口。`,
      hasCoverage: false
    };
  }
  if (degraded.length > 0) {
    return {
      ...base,
      kind: "partial",
      label: "来源仅部分覆盖",
      detail: `${degraded.length}/${enabled.length} 个启用来源报告覆盖缺口；结果不能视为完整。`,
      hasCoverage: healthy.length > 0
    };
  }
  if (stale.length > 0) {
    return {
      ...base,
      kind: "stale",
      label: "来源核验已过期",
      detail: `${stale.length}/${enabled.length} 个启用来源超过自身频率的两倍或 6 小时未成功核验。`,
      hasCoverage: false
    };
  }
  if (healthy.length === enabled.length) {
    return {
      ...base,
      kind: "healthy",
      label: "公开来源覆盖正常",
      detail: `${healthy.length} 个启用来源均在声明频率内完成核验；这不代表覆盖全部岗位。`,
      hasCoverage: true
    };
  }
  return {
    ...base,
    kind: "pending",
    label: "等待首次核验",
    detail: `${enabled.length - healthy.length} 个启用来源尚未产生可信成功记录。`,
    hasCoverage: false
  };
}
