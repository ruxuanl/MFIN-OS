import { describe, expect, it } from "vitest";

import {
  getDisplayPermissionState,
  isActiveReusableGrant,
  isPermanentlyForbiddenCapability,
  type GrantSummary
} from "./model";

const now = new Date("2026-08-10T08:00:00.000Z");

function grant(overrides: Partial<GrantSummary> = {}): GrantSummary {
  return {
    mode: "persistent",
    active: true,
    startsAt: "2026-08-10T07:00:00.000Z",
    expiresAt: null,
    ...overrides
  };
}

describe("permission display state", () => {
  it("lets the privacy lock override an otherwise active grant", () => {
    expect(getDisplayPermissionState(grant(), true, now)).toEqual({
      enabled: false,
      label: "隐私锁已阻止",
      reason: "privacy_locked"
    });
  });

  it("treats an expired temporary grant as disabled", () => {
    expect(
      getDisplayPermissionState(
        grant({ mode: "temporary", expiresAt: "2026-08-10T07:59:59.000Z" }),
        false,
        now
      ).reason
    ).toBe("expired");
  });

  it("distinguishes once, temporary, and persistent grants", () => {
    expect(getDisplayPermissionState(grant({ mode: "once" }), false, now).reason).toBe("once");
    expect(
      getDisplayPermissionState(
        grant({ mode: "temporary", expiresAt: "2026-08-11T08:00:00.000Z" }),
        false,
        now
      ).reason
    ).toBe("temporary");
    expect(getDisplayPermissionState(grant(), false, now).reason).toBe("persistent");
  });

  it("accepts only active reusable grants for connection bootstrap", () => {
    expect(isActiveReusableGrant(grant(), now)).toBe(true);
    expect(
      isActiveReusableGrant(
        grant({ mode: "temporary", expiresAt: "2026-08-11T08:00:00.000Z" }),
        now
      )
    ).toBe(true);
    expect(isActiveReusableGrant(grant({ mode: "once" }), now)).toBe(false);
    expect(
      isActiveReusableGrant(
        grant({ mode: "temporary", expiresAt: "2026-08-10T07:59:59.000Z" }),
        now
      )
    ).toBe(false);
  });
});

describe("permanently forbidden capabilities", () => {
  it("never treats sending or application submission as configurable", () => {
    expect(isPermanentlyForbiddenCapability("gmail.send")).toBe(true);
    expect(isPermanentlyForbiddenCapability("application.submit")).toBe(true);
    expect(isPermanentlyForbiddenCapability("gmail.analysis")).toBe(false);
  });
});
