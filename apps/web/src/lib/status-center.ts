import type { AppUser } from "@/lib/auth/types";
import {
  getDisplayPermissionState,
  type CapabilitySummary,
  type GrantSummary
} from "@/lib/permissions/model";
import { createClient } from "@/lib/supabase/server";
import {
  deriveJobSourceCoverage,
  type JobSourceCoverage,
  type JobSourceSnapshot
} from "@/lib/jobs/source-health";

export type StatusCapability = CapabilitySummary & {
  grant?: GrantSummary;
  state: ReturnType<typeof getDisplayPermissionState>;
};

export type StatusCenterData = {
  isMock: boolean;
  privacyLocked: boolean;
  capabilities: StatusCapability[];
  connections: Array<{ provider: string; status: string; lastSuccessAt: string | null; stale: boolean }>;
  taskCounts: Record<string, number>;
  recentAudit: Array<{ id: string; action: string; outcome: string; createdAt: string }>;
  jobRadar: {
    coverage: JobSourceCoverage;
    sources: Array<JobSourceSnapshot & {
      id: string;
      displayName: string;
      sourceKind: string;
      baseUrl: string;
      sourceDomain: string;
      coverageScope: string;
      usageNote: string | null;
      adapterVersion: string;
      updatedAt: string;
    }>;
    recentRuns: Array<{
      id: string;
      sourceId: string;
      status: string;
      observedCount: number;
      newCount: number;
      updatedCount: number;
      errorCode: string | null;
      coverageGap: string | null;
      startedAt: string;
      finishedAt: string | null;
    }>;
  };

};

const previewCapabilities: CapabilitySummary[] = [
  {
    capabilityKey: "ai.master",
    category: "ai",
    label: "AI 与自动化总开关",
    description: "控制全部 AI 分析、推荐和自动写入。",
    riskLevel: "high",
    requiresAi: false,
    supportsOnce: false,
    supportsTimed: true
  },
  {
    capabilityKey: "calendar.read",
    category: "calendar",
    label: "读取日历",
    description: "读取事件用于冲突判断。",
    riskLevel: "medium",
    requiresAi: false,
    supportsOnce: true,
    supportsTimed: true
  },
  {
    capabilityKey: "ai.resume_analysis",
    category: "ai",
    label: "简历分析",
    description: "把用户选中的简历发送给 AI，分析内容、结构和可读性。",
    riskLevel: "high",
    requiresAi: true,
    supportsOnce: true,
    supportsTimed: true
  },
  {
    capabilityKey: "ai.jd_analysis",
    category: "ai",
    label: "JD 匹配分析",
    description: "把选中的 JD 和简历发送给 AI，生成匹配、紧急度与投递建议。",
    riskLevel: "high",
    requiresAi: true,
    supportsOnce: true,
    supportsTimed: true
  },
  {
    capabilityKey: "gmail.analysis",
    category: "gmail",
    label: "邮件分析",
    description: "分析必要邮件摘要与证据。",
    riskLevel: "high",
    requiresAi: true,
    supportsOnce: true,
    supportsTimed: true
  },
  {
    capabilityKey: "files.upload",
    category: "files",
    label: "文件上传",
    description: "上传用户明确选择的文件。",
    riskLevel: "high",
    requiresAi: false,
    supportsOnce: true,
    supportsTimed: true
  }
];

export async function getStatusCenterData(user: AppUser): Promise<StatusCenterData> {
  if (user.isMock) {
    return {
      isMock: true,
      privacyLocked: false,
      capabilities: previewCapabilities.map((capability) => ({
        ...capability,
        state: getDisplayPermissionState(undefined, false)
      })),
      connections: [{ provider: "google_identity", status: "preview", lastSuccessAt: null, stale: false }],
      taskCounts: {},
      recentAudit: [],
      jobRadar: {
        coverage: deriveJobSourceCoverage([]),
        sources: [],
        recentRuns: []
      }
    };
  }

  const supabase = await createClient();
  const { data: lock, error: lockError } = await supabase
    .from("privacy_locks")
    .select("is_locked")
    .eq("user_id", user.id)
    .maybeSingle();
  if (lockError) throw lockError;

  const privacyLocked = Boolean(lock?.is_locked);
  if (!privacyLocked) {
    const { error } = await supabase.rpc("reconcile_my_permissions");
    if (error) throw error;
  }

  const [
    capabilityResult,
    grantResult,
    connectionResult,
    taskResult,
    auditResult,
    jobSourceResult,
    jobSourceRunResult
  ] = await Promise.all([
    supabase.from("capability_definitions").select("*").order("category").order("capability_key"),
    supabase.from("permission_grants").select("capability_key, mode, active, starts_at, expires_at"),
    supabase.from("external_connections").select("provider, status, last_success_at").order("provider"),
    supabase.from("automation_runs").select("status"),
    supabase.from("audit_events").select("id, action, outcome, created_at").order("created_at", { ascending: false }).limit(8),
    supabase.from("job_sources")
      .select("id, display_name, source_kind, base_url, source_domain, coverage_scope, usage_note, polling_interval_minutes, adapter_version, approval_status, enabled, health_status, last_attempt_at, last_success_at, last_verified_at, last_error_code, coverage_gap, updated_at")
      .order("display_name").then((result) => result.error?.code === "PGRST205" ? { ...result, data: [], error: null } : result),
    supabase.from("job_source_runs")
      .select("id, source_id, status, observed_count, new_count, updated_count, error_code, coverage_gap, started_at, finished_at")
      .order("started_at", { ascending: false })
      .limit(10).then((result) => result.error?.code === "PGRST205" ? { ...result, data: [], error: null } : result)
  ]);

  const firstError = [
    capabilityResult,
    grantResult,
    connectionResult,
    taskResult,
    auditResult,
    jobSourceResult,
    jobSourceRunResult
  ]
    .map((result) => result.error)
    .find(Boolean);
  if (firstError) throw firstError;

  const grants = new Map(
    (grantResult.data ?? []).map((grant) => [
      grant.capability_key,
      {
        mode: grant.mode as GrantSummary["mode"],
        active: grant.active,
        startsAt: grant.starts_at,
        expiresAt: grant.expires_at
      } satisfies GrantSummary
    ])
  );

  const taskCounts = (taskResult.data ?? []).reduce<Record<string, number>>((counts, run) => {
    counts[run.status] = (counts[run.status] ?? 0) + 1;
    return counts;
  }, {});

  const jobSources = (jobSourceResult.data ?? []).map((source) => ({
    id: source.id,
    displayName: source.display_name,
    sourceKind: source.source_kind,
    baseUrl: source.base_url,
    sourceDomain: source.source_domain,
    coverageScope: source.coverage_scope,
    usageNote: source.usage_note,
    adapterVersion: source.adapter_version,
    approvalStatus: source.approval_status,
    enabled: source.enabled,
    healthStatus: source.health_status,
    pollingIntervalMinutes: source.polling_interval_minutes,
    lastAttemptAt: source.last_attempt_at,
    lastSuccessAt: source.last_success_at,
    lastVerifiedAt: source.last_verified_at,
    lastErrorCode: source.last_error_code,
    coverageGap: source.coverage_gap,
    updatedAt: source.updated_at
  }));

  return {
    isMock: false,
    privacyLocked,
    capabilities: (capabilityResult.data ?? []).filter((capability) => !capability.capability_key.startsWith("wechat.")).map((capability) => {
      const grant = grants.get(capability.capability_key);
      return {
        capabilityKey: capability.capability_key,
        category: capability.category,
        label: capability.label,
        description: capability.description,
        riskLevel: capability.risk_level as CapabilitySummary["riskLevel"],
        requiresAi: capability.requires_ai,
        supportsOnce: capability.supports_once,
        supportsTimed: capability.supports_timed,
        grant,
        state: getDisplayPermissionState(grant, privacyLocked)
      };
    }),
    connections: (connectionResult.data ?? []).map((connection) => ({
      provider: connection.provider,
      status: connection.status,
      lastSuccessAt: connection.last_success_at,
      stale: connection.status === "connected" && (!connection.last_success_at || Date.now() - Date.parse(connection.last_success_at) > 24 * 60 * 60 * 1000)
    })),
    taskCounts,
    recentAudit: (auditResult.data ?? []).map((event) => ({
      id: event.id,
      action: event.action,
      outcome: event.outcome,
      createdAt: event.created_at
    })),
    jobRadar: {
      coverage: deriveJobSourceCoverage(jobSources),
      sources: jobSources,
      recentRuns: (jobSourceRunResult.data ?? []).map((run) => ({
        id: run.id,
        sourceId: run.source_id,
        status: run.status,
        observedCount: run.observed_count,
        newCount: run.new_count,
        updatedCount: run.updated_count,
        errorCode: run.error_code,
        coverageGap: run.coverage_gap,
        startedAt: run.started_at,
        finishedAt: run.finished_at
      }))
    }
  };
}
