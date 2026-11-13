import { describe, expect, it } from "vitest";

import { calendarFailureCode, calendarFailureNotice } from "./errors";

describe("Calendar failure diagnostics", () => {
  it.each([
    ["calendar_oauth_invalid_grant", "reauthorization_required"],
    ["calendar_oauth_invalid_client", "oauth_client_invalid"],
    ["calendar_oauth_scope_missing", "oauth_scope_missing"],
    ["calendar_oauth_scope_expanded", "oauth_scope_expanded"],
    ["calendar_provider_accessNotConfigured", "calendar_api_disabled"],
    ["calendar_provider_SERVICE_DISABLED", "calendar_api_disabled"],
    ["calendar_permission_privacy_locked", "privacy_locked"],
    ["calendar_connection_paused", "paused"]
  ])("maps %s to a recoverable notice", (code, notice) => {
    expect(calendarFailureNotice(new Error(code))).toBe(notice);
  });

  it("never copies arbitrary provider bodies, database messages or thrown values into diagnostics", () => {
    for (const error of [new Error("private provider body"), { message: "private body" }, null]) {
      expect(calendarFailureNotice(error)).toBe("sync_failed");
      expect(calendarFailureCode(error)).toBe("calendar_sync_failed");
    }
  });
});
