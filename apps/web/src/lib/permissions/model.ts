export type GrantMode = "off" | "once" | "temporary" | "persistent";

export type CapabilitySummary = {
  capabilityKey: string;
  category: string;
  label: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  requiresAi: boolean;
  supportsOnce: boolean;
  supportsTimed: boolean;
};

export type GrantSummary = {
  mode: GrantMode;
  active: boolean;
  startsAt: string;
  expiresAt: string | null;
};

export type DisplayPermissionState = {
  enabled: boolean;
  label: string;
  reason: "privacy_locked" | "off" | "expired" | "scheduled" | "once" | "temporary" | "persistent";
};

export function getDisplayPermissionState(
  grant: GrantSummary | undefined,
  privacyLocked: boolean,
  now = new Date()
): DisplayPermissionState {
  if (privacyLocked) {
    return { enabled: false, label: "隐私锁已阻止", reason: "privacy_locked" };
  }
  if (!grant || !grant.active || grant.mode === "off") {
    return { enabled: false, label: "关闭", reason: "off" };
  }

  const startsAt = new Date(grant.startsAt);
  if (startsAt > now) {
    return { enabled: false, label: "尚未生效", reason: "scheduled" };
  }
  if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
    return { enabled: false, label: "已到期", reason: "expired" };
  }
  if (grant.mode === "once") {
    return { enabled: true, label: "仅本次", reason: "once" };
  }
  if (grant.mode === "temporary") {
    return { enabled: true, label: "限时开启", reason: "temporary" };
  }
  return { enabled: true, label: "持续开启", reason: "persistent" };
}

export function isActiveReusableGrant(grant: GrantSummary | undefined, now = new Date()) {
  const state = getDisplayPermissionState(grant, false, now);
  return state.reason === "temporary" || state.reason === "persistent";
}

export const forbiddenCapabilities = new Set([
  "gmail.send",
  "gmail.forward",
  "gmail.reply",
  "wechat.send",
  "contacts.contact",
  "job.apply",
  "application.submit",
  "offer.accept",
  "offer.reject",
  "recruiting_profile.update"
]);

export function isPermanentlyForbiddenCapability(capabilityKey: string) {
  return forbiddenCapabilities.has(capabilityKey);
}
