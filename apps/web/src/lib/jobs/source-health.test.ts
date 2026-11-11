import { describe, expect, it } from "vitest";

import { deriveJobSourceCoverage, type JobSourceSnapshot } from "./source-health";

const now = new Date("2026-08-24T10:00:00.000Z");

function source(overrides: Partial<JobSourceSnapshot> = {}): JobSourceSnapshot {
  return {
    approvalStatus: "approved",
    enabled: true,
    healthStatus: "healthy",
    pollingIntervalMinutes: 360,
    lastAttemptAt: "2026-08-24T09:00:00.000Z",
    lastSuccessAt: "2026-08-24T09:00:00.000Z",
    lastVerifiedAt: "2026-08-24T09:00:00.000Z",
    lastErrorCode: null,
    coverageGap: null,
    ...overrides
  };
}

describe("job source coverage", () => {
  it("does not pretend coverage exists before the user configures sources", () => {
    expect(deriveJobSourceCoverage([], now)).toMatchObject({
      kind: "unconfigured",
      hasCoverage: false,
      enabledCount: 0
    });
  });

  it("keeps proposed sources closed until approval", () => {
    expect(deriveJobSourceCoverage([
      source({ approvalStatus: "pending", enabled: false, healthStatus: "disabled" })
    ], now)).toMatchObject({ kind: "awaiting_approval", hasCoverage: false });
  });

  it("treats a fresh successful run as bounded coverage, not complete discovery", () => {
    const result = deriveJobSourceCoverage([source()], now);
    expect(result).toMatchObject({ kind: "healthy", hasCoverage: true, healthyCount: 1 });
    expect(result.detail).toContain("不代表覆盖全部岗位");
  });

  it("makes partial, failed, and stale runs visible", () => {
    expect(deriveJobSourceCoverage([source({ healthStatus: "degraded", coverageGap: "pagination_limited" })], now).kind)
      .toBe("partial");
    expect(deriveJobSourceCoverage([source({ healthStatus: "failed", lastErrorCode: "http_503" })], now).kind)
      .toBe("failed");
    expect(deriveJobSourceCoverage([source({ lastVerifiedAt: "2026-08-23T00:00:00.000Z" })], now).kind)
      .toBe("stale");
  });
});
